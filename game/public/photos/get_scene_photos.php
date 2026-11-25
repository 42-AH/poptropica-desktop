<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/server/photos.php';
header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');header('Cache-Control: private, max-age=300');
$scene=$_POST['scene_id']??$_GET['scene_id']??'';$records=[];
if(is_string($scene)&&preg_match('/^[a-zA-Z0-9_]{1,80}$/D',$scene)){
    foreach(photos_catalog() as $island=>$photos)foreach($photos as $id=>$photo){
        if(strcasecmp($scene,$island.ucfirst($photo['scene']))!==0)continue;
        $trigger=$photo['trigger'];$params=$photo['params'];
        if($trigger==='event')$value=$params['eventName']??'';
        elseif($trigger==='item')$value=$params['itemID']??'';
        elseif($trigger==='location')$value=implode(',',[$params['xpos']??0,$params['ypos']??0,$params['proximity']??50]);
        else continue;
        $records[]=['item_id'=>(string)$id,'field_name'=>'trigger_'.$trigger,'field_data'=>$value];
    }
}
echo http_build_query(['answer'=>'ok','json'=>json_encode($records,JSON_THROW_ON_ERROR)],'','&',PHP_QUERY_RFC3986);
