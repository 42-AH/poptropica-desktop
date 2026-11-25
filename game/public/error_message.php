<?php
declare(strict_types=1);
// The original engine calls this when a room cannot start. Keep its save and
// return to the title through the same account-owned iframe.
header('Cache-Control: no-store');
header('Location: /base.php?room=Home&island=Home',true,303);
exit;
