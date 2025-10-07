<?php
require_once __DIR__ . '/_common.php';
$gsp = isset($_GET['gsp']) ? strtoupper($_GET['gsp']) : null;
if (!$gsp || !preg_match('/^[A-Z]$/', $gsp)) goat_json(['error' => 'Valid gsp letter required'], 400);
$from = $_GET['from'] ?? null; $to = $_GET['to'] ?? null;

$tz = new DateTimeZone('Europe/London');
$now = new DateTime('now', $tz);
$hour = (int)$now->format('H');
$minute = (int)$now->format('i');
$in_publish_window = ($hour === 15 && $minute >= 45) || ($hour === 16 && $minute <= 30);
$RATES_TTL = $in_publish_window ? 180 : 3600;

$start = $from ? new DateTime($from, $tz) : (new DateTime('today', $tz));
$end   = $to   ? new DateTime($to,   $tz) : (clone $start)->modify('+48 hours'); // ensure through end of tomorrow
$pf = (clone $start)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
$pt = (clone $end)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');

$productsKey='products-agile';
$products = goat_fetch('https://api.octopus.energy/v1/products/?brand=OCTOPUS_ENERGY&page_size=250', $productsKey, 43200);
$prodCode=null; if ($products){ $plist=json_decode($products,true); foreach(($plist['results'] ?? []) as $p){ if (stripos($p['display_name']??'','Agile')!==false && ($p['is_variable']??false)) { $prodCode=$p['code']; break; } } }
if(!$prodCode) goat_json(['error'=>'Could not determine Agile product'], 502);

$tariff="E-1R-$prodCode-$gsp";
$rates=[]; $url="https://api.octopus.energy/v1/products/$prodCode/electricity-tariffs/$tariff/standard-unit-rates/?period_from=$pf&period_to=$pt&page_size=250";
while($url){
  $k='rates-'.sha1($url);
  $payload = goat_fetch($url, $k, $RATES_TTL);
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
goat_json($rates);
