import {spawn} from 'node:child_process';

export function ssh(which, command) {
    const host = which === 'target' ? process.env.POPTROPICA_SERVER : process.env.POPTROPICA_BACKUP_HOST;
    if (!host || host.startsWith('-')) throw new Error('Configure the SSH host alias');
    return spawn('ssh', ['-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host, command], {windowsHide:true, stdio:['pipe','pipe','pipe']});
}

export function run(which, command, input) {
    return new Promise((resolve, reject) => {
        const child = ssh(which, command);
        const out = [], errors = [];
        child.stdout.on('data', data => out.push(data));
        child.stderr.on('data', data => errors.push(data));
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(Buffer.concat(errors).toString())));
        child.stdin.end(input);
    });
}
