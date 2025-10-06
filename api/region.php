<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
$cacheTtl = 86400;
$cacheDir = sys_get_temp_dir() . '/agile-cache';
@mkdir($cacheDir, 0775, true);
function cached_get($url, $ttl, $cacheDir) {
  $key = $cacheDir . '/' . sha1($url) . '.json';
  if (file_exists($key) && (time() - filemtime($key)) < $ttl) return file_get_contents($key);
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>15, CURLOPT_USERAGENT=>'GOAT/1.0']);
  $res = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($code>=200 && $code<300 && $res) file_put_contents($key, $res);
  return $res ?: '{"results":[]}';
}
if (isset($_GET['mpan'])) {
  $mpan = preg_replace('/\D+/', '', $_GET['mpan']);
  $data = json_decode(cached_get("https://api.octopus.energy/v1/electricity-meter-points/$mpan/", $cacheTtl, $cacheDir), true);
  $gsp = $data['gsp'] ?? null;
  $gsp = $gsp ? strtoupper(trim($gsp, '_')) : null;
  echo json_encode(['gsp' => $gsp]); exit;
}
if (isset($_GET['postcode'])) {
  $pc = strtoupper(preg_replace('/\s+/', '', $_GET['postcode']));
  $data = json_decode(cached_get("https://api.octopus.energy/v1/industry/grid-supply-points/?postcode=$pc", $cacheTtl, $cacheDir), true);
  $gsp = !empty($data['results'][0]['group_id']) ? strtoupper(trim($data['results'][0]['group_id'], '_')) : null;
  echo json_encode(['gsp' => $gsp]); exit;
}
http_response_code(400); echo json_encode(['error' => 'Provide postcode or mpan']);
