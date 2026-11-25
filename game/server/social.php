<?php
function social_chat_catalog(): array {
    static $catalog;
    if ($catalog !== null) return $catalog;
    $catalog=['categories'=>[],'messages'=>[],'replies'=>[]];$next=1;$categoryIds=[];
    foreach (['multiplayer/chat.xml','scenes/hub/arcade/chat.xml'] as $file) {
        $xml=simplexml_load_file(dirname(__DIR__).'/public/game/data/'.$file,'SimpleXMLElement',LIBXML_NONET);
        if (!$xml) throw new RuntimeException('Missing original chat catalog');
        foreach ($xml->subject as $subject) {
            $name=(string)$subject['id'];
            if (!isset($categoryIds[$name])) {
                $id=count($categoryIds)+1;$categoryIds[$name]=$id;
                $catalog['categories'][]=['chat_keyword_id'=>$id,'chat_keyword_name'=>$name];
            }
            $category=$categoryIds[$name];$local=[];
            foreach ($subject->msg as $message) {
                $id=$next++;$local[(string)$message['id']]=$id;
                $catalog['messages'][$id]=['chat_message_id'=>$id,'chat_message'=>trim((string)$message),'chat_ani'=>'','category'=>$category];
            }
            foreach ($subject->reply as $reply) {
                $parent=$local[(string)$reply['replyId']]??null;if (!$parent) continue;
                $id=$next++;
                $catalog['messages'][$id]=['chat_message_id'=>$id,'chat_message'=>trim((string)$reply),'chat_ani'=>'','category'=>0];
                $catalog['replies'][$parent][]=$id;
            }
        }
    }
    foreach ($catalog['messages'] as $id=>&$message) $message['chat_reply_num']=count($catalog['replies'][$id]??[]);
    unset($message);
    return $catalog;
}
function social_legacy_questions(?int $parent=null): array {
    $catalog=social_chat_catalog();
    if($parent!==null) {
        $ids=array_slice($catalog['replies'][$parent]??[],0,3);
        $result=['quest'=>$catalog['messages'][$parent]['chat_message']??''];
        // Original chat has three reply slots. Keep only archived presets.
        if(!$ids)$ids=array_slice(array_keys($catalog['messages']),0,3);
        for($i=0;$i<3;$i++){$id=$ids[$i%count($ids)];$result['ans'.($i+1)]=$catalog['messages'][$id]['chat_message'];$result['ans_id'.($i+1)]=$id;}
        return $result;
    }
    $ids=array_slice(array_keys($catalog['replies']),0,3);$result=[];
    for($i=0;$i<3;$i++){$id=$ids[$i%count($ids)];$result['quest'.($i+1)]=$catalog['messages'][$id]['chat_message'];$result['q_id'.($i+1)]=$id;}
    return $result;
}
