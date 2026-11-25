<?php
declare(strict_types=1);

/** Replies for archived LoadVars URLs. These public compatibility facts do not grant a login or change a save. */
function legacy_static_reply(string $route): never {
    $fields = match ($route) {
        'campaign' => ['answer' => 'ok', 'on_main_json' => '{}', 'off_main_json' => '{}', 'cache' => '3600'],
        'islands' => ['answer' => 'ok', 'json' => legacy_static_island_json()],
        'login', 'skullduggery' => ['answer' => 'nologin'],
        'register' => ['answer' => 'ok'],
        'time_limited' => ['answer' => 'ok', 'json' => '[]'],
        'comics' => ['answer' => 'ok', 'comic_streams_json' => '{}'],
        'clips' => ['answer' => 'ok', 'creator_clips_json' => '{}'],
        'games' => ['answer' => 'ok', 'games_json' => '[]'],
        'track' => [],
    };

    header('Content-Type: application/x-www-form-urlencoded; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo http_build_query($fields, '', '&', PHP_QUERY_RFC3986);
    exit;
}

function legacy_static_island_json(): string {
    // Stable IDs, names, and order from the site's archived endpoint are protocol data.
    $islands = json_decode(file_get_contents(__DIR__ . '/legacy-island-names.json'), false, 512, JSON_THROW_ON_ERROR);
    return json_encode($islands, JSON_THROW_ON_ERROR);
}
