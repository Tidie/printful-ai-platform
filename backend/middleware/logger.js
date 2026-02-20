export function logger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
        console.log(`${color}[${res.statusCode}]\x1b[0m ${req.method} ${req.path} — ${ms}ms`);
    });
    next();
}