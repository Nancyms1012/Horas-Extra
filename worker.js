// This worker serves static assets from the public directory
// No custom logic needed - Cloudflare handles asset serving via [assets] config
export default {
    async fetch(request, env) {
        return new Response("Not found", { status: 404 });
    }
};
