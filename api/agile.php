<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/_common.php';

$gsp = isset($_GET['gsp']) ? strtoupper($_GET['gsp']) : null;
if (!$gsp || !preg_match('/^[A-Z]$/', $gsp)) { http_response_code(400); echo json_encode(['error' => 'Valid gsp letter required']); exit; }
$from = $_GET['from'] ?? null; $to = $_GET['to'] ?? null;

$tz = new DateTimeZone('Europe/London');
$now = new DateTime('now', $tz);
$hour = (int)$now->format('H');
$minute = (int)$now->format('i');
$in_publish_window = ($hour === 15 && $minute >= 45) || ($hour === 16 && $minute <= 30);
$RATES_TTL = $in_publish_window ? 180 : 3600;

$start = $from ? new DateTime($from, $tz) : (new DateTime('today', $tz));
$end   = $to   ? new DateTime($to,   $tz) : (clone $start)->modify('+36 hours');
$pf = (clone $start)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
$pt = (clone $end)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');

$productsKey='products-agile';
$products = goat_cache_read($productsKey, 43200);
if (!$products) { $products = goat_fetch('https://api.octopus.energy/v1/products/?brand=OCTOPUS_ENERGY&page_size=250'); if ($products) goat_cache_write($productsKey, $products); }
$prodCode=null; if ($products){ $plist=json_decode($products,true); foreach($plist['results'] as $p){ if (stripos($p['display_name']??'','Agile')!==false && ($p['is_variable']??false)) { $prodCode=$p['code']; break; } } }
if(!$prodCode){ http_response_code(502); echo json_encode(['error'=>'Could not determine Agile product']); exit; }

$tariff="E-1R-$prodCode-$gsp";
$rates=[]; $url="https://api.octopus.energy/v1/products/$prodCode/electricity-tariffs/$tariff/standard-unit-rates/?period_from=$pf&period_to=$pt&page_size=250";
while($url){
  $k='rates-'.sha1($url);
  $payload = goat_cache_read($k, $RATES_TTL);
  if(!$payload){ $payload = goat_fetch($url); if($payload) goat_cache_write($k,$payload); }
  if(!$payload) break;
  $json=json_decode($payload,true);
  if (!empty($json['results'])) foreach($json['results'] as $r){
    $inc = isset($r['value_inc_vat']) ? $r['value_inc_vat'] : (isset($r['value_exc_vat']) ? round($r['value_exc_vat']*1.05,3) : null);
    if($inc===null) continue;
    $rates[]=['start'=>$r['valid_from'],'end'=>$r['valid_to'],'price_inc_vat_p_per_kwh'=>$inc];
  }
  $url=$json['next']??null;
}
usort($rates,function($a,$b){return strcmp($a['start'],$b['start']);});
echo json_encode($rates, JSON_UNESCAPED_SLASHES);