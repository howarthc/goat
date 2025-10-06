<?php
header('Content-Type: application/json; charset=utf-8');
$checks = [];
$checks['php_version'] = PHP_VERSION;
$checks['curl_loaded'] = function_exists('curl_init');
$checks['temp_dir'] = sys_get_temp_dir();
$dns_ok = false; $ip = gethostbyname('api.octopus.energy'); if ($ip && filter_var($ip, FILTER_VALIDATE_IP)) { $dns_ok = true; }
$checks['dns_api_octopus'] = ['ok'=>$dns_ok, 'ip'=>$ip];
// quick HEAD ping
$context = stream_context_create(['http'=>['method'=>'GET','timeout'=>5,'header'=>"User-Agent: GOAT/3.0 (+kitt.net)
"]]);
$ping = @file_get_contents('https://api.octopus.energy/v1/status/', false, $context);
$checks['octopus_ping'] = $ping !== false;
echo json_encode($checks);