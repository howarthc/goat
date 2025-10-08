<?php
function goat_fetch($url, $ttl_key = null, $ttl = 0) {
  if ($ttl_key && $ttl > 0) {
    $cached = goat_cache_read($ttl_key, $ttl);
    if ($cached !== null) return $cached;
  }
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 20,
      CURLOPT_CONNECTTIMEOUT => 6,
      CURLOPT_USERAGENT => 'GOAT/1.1 (+kitt.net)',
      CURLOPT_IPRESOLVE => defined('CURL_IPRESOLVE_V4') ? CURL_IPRESOLVE_V4 : 1,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res !== false && $code >= 200 && $code < 300) {
      if ($ttl_key && $ttl > 0) goat_cache_write($ttl_key, $res);
      return $res;
    }
  } else {
    $opts = ['http' => ['method'=>'GET','timeout'=>20,'header'=>"User-Agent: GOAT/1.1 (+kitt.net)\r\n"]];
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    if ($res !== false) {
      if ($ttl_key && $ttl > 0) goat_cache_write($ttl_key, $res);
      return $res;
    }
  }
  return null;
}
function goat_cache_dir() {
  $dir = sys_get_temp_dir() . '/agile-cache';
  if (!file_exists($dir)) @mkdir($dir, 0775, true);
  return $dir;
}
function goat_cache_read($key, $ttl) {
  $dir = goat_cache_dir();
  $f = $dir . '/' . sha1($key) . '.json';
  if (file_exists($f) && (time() - filemtime($f)) < $ttl) return file_get_contents($f);
  return null;
}
function goat_cache_write($key, $data) {
  $dir = goat_cache_dir();
  @file_put_contents($dir . '/' . sha1($key) . '.json', $data);
}
function goat_json($arr, $code=200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  echo json_encode($arr, JSON_UNESCAPED_SLASHES);
  exit;
}
?>