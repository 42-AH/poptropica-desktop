<?php
declare(strict_types=1);

function finish(int $status): never {
    http_response_code($status);
    exit;
}

$host = '127.0.0.1:'.$_SERVER['SERVER_PORT'];
if (($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1' || ($_SERVER['HTTP_HOST'] ?? '') !== $host) {
    finish(403);
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (($origin !== '' && $origin !== 'http://'.$host) || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    finish(403);
}
$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET','HEAD','POST'], true)) {
    header('Allow: GET, HEAD, POST');
    finish(405);
}
$path = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (!str_starts_with($path, '/') || preg_match('~[\x00-\x1f:\\\\]|(?:^|/)\.{1,2}(?:/|$)~', $path)) {
    finish(400);
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; form-action 'self'; frame-ancestors 'self'; base-uri 'self'");
if ($path === '/__desktop/health') {
    header('Content-Type: text/plain');
    header('Cache-Control: no-store');
    echo getenv('POPTROPICA_DESKTOP_TOKEN') ?: '';
    exit;
}
if ($path === '/') {
    header('Location: /play/', true, 302);
    exit;
}
if ($path === '/play' || $path === '/game') {
    $query = $_SERVER['QUERY_STRING'] ?? '';
    header('Location: '.$path.'/'.($query === '' ? '' : '?'.$query), true, 308);
    exit;
}
if ($path === '/api/cloud.php' && $method === 'GET' && ($_GET['action'] ?? 'session') === 'session') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['user'=>null,'csrf'=>'','inviteRequired'=>false,'gamePolicy'=>['version'=>1,'bonusQuests'=>true]]);
    exit;
}
if (str_starts_with($path, '/api/')) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    http_response_code(503);
    echo json_encode(['error'=>'Open Play online to use this feature.']);
    exit;
}
if (str_ends_with($path, '/')) {
    $path .= 'index.html';
}
$root = $_SERVER['DOCUMENT_ROOT'] ?: __DIR__.'/public';
$assetExtensions = ['swf','xml','png','jpg','jpeg','webp','gif','mp3','ogg','wav','flv','pop','ttf','ico','txt','svg','json','wasm','js','mjs','css','html','webmanifest'];
$generation = getenv('POPTROPICA_DESKTOP_GENERATION');
if (in_array($path, ['/play/index.html','/cloud/game-loader.js','/cloud/play.mjs'], true)) {
    $root = __DIR__.'/overlay';
} elseif ($generation && in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), $assetExtensions, true)) {
    if (is_file($generation.'/removed'.$path)) {
        finish(404);
    }
    if (is_file($generation.'/files'.$path)) {
        $root = $generation.'/files';
    }
}
$file = realpath($root.$path);
if (!$file || !str_starts_with($file, realpath($root).DIRECTORY_SEPARATOR) || !is_file($file)) {
    finish(404);
}
$extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if ($extension === 'php') {
    $routes = ['AMFPHP/callRouter.php','brain/track.php','comics/get_comic_streams.php','creatorClips/get_creator_clips.php','games/interface/get_games.php','photos/get_scene_photos.php','base.php','beta.php','error_message.php','get_answers.php','get_campaign_list.php','get_inventory_menu.php','get_island_names.php','get_item_desc.php','get_questions.php','getPrefix.php','index.php','list_items.php','list_redeemable_items.php','login.php','part-register.php','save_image.php','set_skullduggery.php','time_limited_is_active.php','time.php'];
    if (!in_array(substr($path, 1), $routes, true)) {
        finish(404);
    }
    header('Cache-Control: no-store');
    $_SERVER['SCRIPT_FILENAME'] = $file;
    require $file;
    exit;
}
if ($method === 'POST') {
    finish(405);
}
$types = ['html'=>'text/html; charset=utf-8','js'=>'text/javascript','mjs'=>'text/javascript','css'=>'text/css','xml'=>'application/xml','json'=>'application/json','webmanifest'=>'application/manifest+json','wasm'=>'application/wasm','swf'=>'application/x-shockwave-flash','mp3'=>'audio/mpeg','png'=>'image/png','gif'=>'image/gif','jpg'=>'image/jpeg','svg'=>'image/svg+xml','ttf'=>'font/ttf','ico'=>'image/x-icon','flv'=>'video/x-flv','txt'=>'text/plain','pop'=>'application/octet-stream'];
$types += ['jpeg'=>'image/jpeg','webp'=>'image/webp','ogg'=>'audio/ogg','wav'=>'audio/wav'];
if (!isset($types[$extension])) {
    finish(404);
}
header('Content-Type: '.$types[$extension]);
$etag = '"'.hash('sha256',$file.'|'.filemtime($file).'|'.filesize($file)).'"';
header('ETag: '.$etag);
header('Cache-Control: private, no-cache');
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    finish(304);
}
$length = filesize($file);
$start = 0;
if (in_array($extension, ['mp3','flv','ogg','wav'], true)) {
    header('Accept-Ranges: bytes');
    $range = ($_SERVER['HTTP_IF_RANGE'] ?? $etag) === $etag ? ($_SERVER['HTTP_RANGE'] ?? '') : '';
    if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/D', $range, $limits) && ($limits[1] !== '' || $limits[2] !== '')) {
        $start = $limits[1] === '' ? max(0, $length - (int)$limits[2]) : (int)$limits[1];
        $end = ($limits[1] === '' || $limits[2] === '') ? $length - 1 : min($length - 1, (int)$limits[2]);
        if ($start > $end) {
            header('Content-Range: bytes */'.$length);
            finish(416);
        }
        header("Content-Range: bytes $start-$end/$length");
        http_response_code(206);
        $length = $end - $start + 1;
    }
}
header('Content-Length: '.$length);
if ($method === 'HEAD' || !$length) {
    exit;
}
if (!isset($end)) {
    readfile($file);
    exit;
}
$stream = fopen($file, 'rb');
fseek($stream, $start);
fpassthru_range($stream, $length);

function fpassthru_range($stream, int $remaining): void {
    while ($remaining > 0 && !feof($stream)) {
        $chunk = fread($stream, min($remaining, 65536));
        if ($chunk === false || $chunk === '') break;
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($stream);
}
