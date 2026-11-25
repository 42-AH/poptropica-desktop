<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-cache');
const FRAMEWORK_SRC = 'framework.swf?build=f452089534b58eb1';
$method=$_SERVER['REQUEST_METHOD']??'GET';
if(!in_array($method,['GET','POST','HEAD'],true)){header('Allow: GET, POST, HEAD');http_response_code(405);exit;}
$request=$method==='POST'?$_POST:$_GET;
function destination(string $key,string $default,bool $required=false): string {
    global $request;
    $value=$request[$key]??($required?null:$default);
    if(!is_string($value)||!preg_match('/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/D',$value)) {
        http_response_code(400);header('Content-Type: text/plain; charset=utf-8');
        exit('The island destination is missing or invalid. Your saved progress is preserved. Reload the game to try again.');
    }
    return $value;
}
function attribute(string $value): string {return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
$room=destination('room','Home',$method==='POST');
$island=destination('island','Home',$method==='POST');
$path=destination('startup_path','gameplay');
// Legacy route names remain accepted while existing browser players update.
$home=in_array($room,['Home','FlashpointStart'],true);
$restart=in_array($room,['WebRestartMiniquest','FlashpointMiniquestRestart'],true);
if($restart&&$method!=='POST'){http_response_code(400);exit('Restart a quest using its in-game reset button.');}
$entry=['room'=>$room,'island'=>$island,'home'=>$home,'restart'=>$restart];
$width=str_starts_with($room,'Ad')?776:1136;
$height=str_starts_with($room,'Ad')?480:673;
$flashvars=http_build_query(['desc'=>$home?'GlobalAS3Embassy':$room,'island'=>$island,'startup_path'=>$path,'state'=>str_starts_with($room,'Ad')?'return_user_advertisement_1':'return_user_standard'],'','&',PHP_QUERY_RFC3986);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poptropica</title>
  <script src="/web-config.js"></script>
  <script src="/cloud/native-page.js"></script>
  <script src="/cloud/game-loader.js"></script>
  <style>html,body{margin:0;background:#139ffd}embed{border:0}</style>
</head>
<body data-web-entry="<?=attribute(json_encode($entry,JSON_THROW_ON_ERROR))?>">
  <embed src="<?=attribute(FRAMEWORK_SRC)?>" width="<?=$width?>" height="<?=$height?>" flashvars="<?=attribute($flashvars)?>" scale="noscale" wmode="gpu" allowscriptaccess="always">
</body>
</html>
