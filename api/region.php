<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/_common.php';

$cacheTtl = 86400; // 24h
if (isset($_GET['mpan'])) {
  $mpan = preg_replace('/\D+/', '', $_GET['mpan']);
  $key = "mpan-$mpan";
  $payload = goat_cache_read($key, $cacheTtl);
  if (!$payload) { $payload = goat_fetch("https://api.octopus.energy/v1/electricity-meter-points/$mpan/"); if ($payload) goat_cache_write($key, $payload); }
  $data = $payload ? json_decode($payload, true) : [];
  $gsp = $data['gsp'] ?? null;
  $gsp = $gsp ? strtoupper(trim($gsp, '_')) : null;
  echo json_encode(['gsp' => $gsp]); exit;
}
if (isset($_GET['postcode'])) {
  $pc = strtoupper(preg_replace('/\s+/', '', $_GET['postcode']));
  $key = "gsp-$pc";
  $payload = goat_cache_read($key, $cacheTtl);
  if (!$payload) { $payload = goat_fetch("https://api.octopus.energy/v1/industry/grid-supply-points/?postcode=$pc"); if ($payload) goat_cache_write($key, $payload); }
  $data = $payload ? json_decode($payload, true) : [];
  $gsp = !empty($data['results'][0]['group_id']) ? strtoupper(trim($data['results'][0]['group_id'], '_')) : null;
  echo json_encode(['gsp' => $gsp]); exit;
}
http_response_code(400); echo json_encode(['error' => 'Provide postcode or mpan']);