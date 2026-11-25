<?php
declare(strict_types=1);

// Compatibility for original public AMF requests. The website provides the
// multiplayer and Realms transports, and does not run advertising campaigns.
final class OpenService {
    public function getFeatureStatus(mixed $request): array {
        $feature = is_array($request) ? ($request['feature'] ?? '') :
            (is_object($request) ? ($request->feature ?? '') : $request);
        $enabled = in_array($feature, ['smartfox', 'lands', 'realms'], true);
        return ['status'=>7, 'error'=>null, 'feature_status'=>$enabled ? 'on' : 'off'];
    }
    public function getCampaigns(mixed $request = null): array {
        return ['status'=>7, 'error'=>null, 'cache'=>300, 'on_main'=>[], 'off_main'=>[]];
    }
    public function getCampaignsHaveXML(mixed $request = null): array {
        return ['status'=>7, 'error'=>null];
    }
}
