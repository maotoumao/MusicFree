// HTML sanitizer function to prevent XSS attacks
export function sanitizeHtml(html: string): string {
    // Remove script tags and their content
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    
    // Remove dangerous event handlers
    html = html.replace(/\s*on\w+\s*=\s*[^>]*/gi, "");
    
    // Remove javascript: URLs
    html = html.replace(/javascript:/gi, "");
    
    // Remove data: URLs (except safe image types)
    html = html.replace(/data:(?!image\/(png|jpg|jpeg|gif|svg|webp))[^"'\s>]*/gi, "");
    
    // Remove iframe, object, embed tags
    html = html.replace(/<(iframe|object|embed|applet|link|meta)\b[^>]*>/gi, "");
    html = html.replace(/<\/(iframe|object|embed|applet|link|meta)>/gi, "");
    
    // Remove form tags
    html = html.replace(/<\/?form\b[^>]*>/gi, "");
    
    // Remove input, button, textarea tags
    html = html.replace(/<(input|button|textarea)\b[^>]*>/gi, "");
    
    // Sanitize href attributes to only allow safe protocols
    html = html.replace(/href\s*=\s*["']([^"']*)["']/gi, (match, url) => {
        const trimmedUrl = url.trim().toLowerCase();
        if (trimmedUrl.startsWith("http://") || 
            trimmedUrl.startsWith("https://") || 
            trimmedUrl.startsWith("mailto:") ||
            trimmedUrl.startsWith("#") ||
            trimmedUrl.startsWith("/")) {
            return match;
        }
        return "href=\"#\"";
    });
    
    // Sanitize src attributes for images
    html = html.replace(/src\s*=\s*["']([^"']*)["']/gi, (match, url) => {
        const trimmedUrl = url.trim().toLowerCase();
        if (
            trimmedUrl.startsWith("http://") || 
            trimmedUrl.startsWith("https://") || 
            trimmedUrl.startsWith("data:image/") ||
            trimmedUrl.startsWith("/")) {
            return match;
        }
        return "src=\"\"";
    });
    
    return html;
}