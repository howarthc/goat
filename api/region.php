<?php
require_once __DIR__ . '/_common.php';
$cacheTtl = 86400;

if (isset($_GET['mpan'])) {
  $mpan = preg_replace('/\D+/', '', $_GET['mpan']);
  $payload = goat_fetch("https://api.octopus.energy/v1/electricity-meter-points/$mpan/", "mpan-$mpan", $cacheTtl);
  $data = $payload ? json_decode($payload, true) : [];
  $gsp = $data['gsp'] ?? null;
  $gsp = $gsp ? strtoupper(trim($gsp, '_')) : null;
  goat_json(['gsp' => $gsp]);
}

if (isset($_GET['postcode'])) {
  $pc = strtoupper(preg_replace('/\s+/', '', $_GET['postcode']));
  $payload = goat_fetch("https://api.octopus.energy/v1/industry/grid-supply-points/?postcode=$pc", "gsp-$pc", $cacheTtl);
  $data = $payload ? json_decode($payload, true) : [];
  $gsp = !empty($data['results'][0]['group_id']) ? strtoupper(trim($data['results'][0]['group_id'], '_')) : null;
  goat_json(['gsp' => $gsp]);
}

goat_json(['error' => 'Provide postcode or mpan'], 400);
