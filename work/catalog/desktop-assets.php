<?php
declare(strict_types=1);

function desktopAssets(string $root): array {
    $out = [];
    $scan = ['archived-quantserve','avatarParts','externalAssets','framework','game','images','items','popups','scenes','video','cloud/fonts','cloud/loading-art','cloud/photo-scenes','ruffle'];
    $types = ['swf','xml','gif','jpeg','jpg','png','mp3','flv','pop','txt','ttf','ico','json','ogg','webp','wav','svg'];
    foreach ($scan as $dir) {
        if (!is_dir($root.'/'.$dir)) continue;
        $walk = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/'.$dir, FilesystemIterator::SKIP_DOTS));
        foreach ($walk as $item) {
            if (!$item->isFile() || $item->isLink()) continue;
            $rel = str_replace('\\','/',substr($item->getPathname(),strlen($root)+1));
            if ($dir === 'ruffle') {
                if (!preg_match('~^ruffle/(ruffle\.js|core\.ruffle\.[0-9a-f]{20}\.js|[0-9a-f]{20}\.wasm)$~D',$rel)) continue;
            } elseif (!in_array(strtolower($item->getExtension()),$types,true) && $rel !== 'game/index.html') continue;
            $out[$rel] = $item->getSize();
        }
    }
    foreach (glob($root.'/*.swf') ?: [] as $file) $out[basename($file)] = filesize($file);
    ksort($out,SORT_STRING);
    return $out;
}

function writeDesktopCatalog(string $root, $stream): void {
    foreach (desktopAssets($root) as $path => $bytes) {
        if (strpbrk($path,"\r\n\t") !== false) throw new RuntimeException('Invalid asset path');
        $digest = hash_file('sha256',$root.'/'.$path);
        if ($digest === false || fwrite($stream,$digest."\t".$bytes."\t".$path."\n") === false) throw new RuntimeException('Unable to catalog asset');
    }
}

if (PHP_SAPI === 'cli' && isset($argv[1])) {
    writeDesktopCatalog(realpath($argv[1]),STDOUT);
    return;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET','HEAD'],true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$public = realpath(dirname(__DIR__));
$release = dirname($public);
$data = getenv('POPTROPICA_DATA') ?: '/var/lib/poptropica';
$cache = $data.'/desktop-assets-cache/'.hash('sha256',$release);
$catalog = $cache.'/catalog.tsv';
try {
    if (!is_file($catalog)) {
        if (!is_dir($cache) && !mkdir($cache,0700,true) && !is_dir($cache)) throw new RuntimeException();
        $lock = fopen($cache.'/build.lock','c');
        if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException();
        if (!is_file($catalog)) {
            $temp = tempnam($cache,'build-');
            $stream = fopen($temp,'wb');
            writeDesktopCatalog($public,$stream);
            if (!fclose($stream) || !rename($temp,$catalog)) throw new RuntimeException();
        }
        flock($lock,LOCK_UN);
        fclose($lock);
    }
    $etag = '"'.hash_file('sha256',$catalog).'"';
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-cache');
    header('ETag: '.$etag);
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') readfile($catalog);
} catch (Throwable $error) {
    http_response_code(503);
}
