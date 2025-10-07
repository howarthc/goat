<?php
function goat_fetch($url) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 15,
      CURLOPT_CONNECTTIMEOUT => 5,
      CURLOPT_USERAGENT => 'GOAT/0.8 (+kitt.net)',
      CURLOPT_IPRESOLVE => defined('CURL_IPRESOLVE_V4') ? CURL_IPRESOLVE_V4 : 1,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res !== false && $code >= 200 && $code < 300) return $res;
    return null;
  }
  $opts = ['http' => ['method'=>'GET','timeout'=>15,'header'=>"User-Agent: GOAT/0.8 (+kitt.net)\r\n"]];
  $ctx = stream_context_create($opts);
  $res = @file_get_contents($url, false, $ctx);
  return $res ?: null;
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
  file_put_contents($dir . '/' . sha1($key) . '.json', $data);
}
?>