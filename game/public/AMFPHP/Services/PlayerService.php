<?php
declare(strict_types=1);

// Original dbid/pass_hash credentials do not authorize website accounts.
// The adapted client loads and commits its whole profile through /api/cloud.php
// and publishes Realms through /api/realms.php. Reject an obsolete client
// explicitly instead of acknowledging writes that were never persisted.
final class PlayerService {
    public function fetch(mixed $method = null, mixed $auth = null, mixed $data = null): array {
        return $this->obsoleteClient();
    }
    public function save(mixed $method = null, mixed $auth = null, mixed $data = null): array {
        return $this->obsoleteClient();
    }
    private function obsoleteClient(): array {
        return ['status'=>21, 'error'=>'profile_protocol_replaced',
            'message'=>'Reload the game from /play/ to use your website account and saved progress.'];
    }
}
