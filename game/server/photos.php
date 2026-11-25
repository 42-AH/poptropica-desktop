<?php
function photos_catalog(): array {
    static $catalog;
    if($catalog!==null)return $catalog;
    $catalog=[];
    foreach(glob(dirname(__DIR__).'/public/game/data/scenes/*/*/photos.xml') as $file){
        $island=basename(dirname($file,2));$scene=basename(dirname($file));
        $source=file_get_contents($file);
        // These are our bundled original definitions. Do not fetch their DTDs.
        $source=preg_replace('/<!DOCTYPE[^>]*>/','',$source);
        $document=simplexml_load_string($source,'SimpleXMLElement',LIBXML_NONET);
        if(!$document)continue;
        foreach($document->photo as $photo){
            $params=[];foreach($photo->param as $param)$params[(string)$param['id']]=(string)$param;
            $catalog[$island][(string)$photo['id']]=['scene'=>$scene,'trigger'=>(string)$photo['trigger'],'params'=>$params];
        }
    }
    return $catalog;
}
