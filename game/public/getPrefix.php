<?php
declare(strict_types=1);
// The game's legacy LoadVars contract uses URL-encoded fields.
$origin=rtrim(getenv('POPTROPICA_ORIGIN')?:'', '/');
if ($origin==='' && getenv('POPTROPICA_ENV')!=='production') {
    $host=$_SERVER['HTTP_HOST']??'';
    if (preg_match('/^(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/D',$host)) $origin='http://'.$host;
}
header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!preg_match('~^https?://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$~D',$origin)) {
    http_response_code(503);
    echo 'error=origin_unavailable';
    exit;
}
echo http_build_query(['prefix'=>$origin],'','&',PHP_QUERY_RFC3986);
