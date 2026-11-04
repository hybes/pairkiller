'use strict';

const FILTERED = '[Filtered]';
const SECRET_KEY = /(?:^|[._-])(?:password|passwd|pwd|secret|token|apikey|api_key|authorization|cookie|cookies|session|sessionid|session_id|sid|sessid|phpsessid|aspsessionid|signature|sig|private_key|csrf|xsrf|jwt|code_verifier|card_number|cardnumber|pan|cvv|cvc)(?:$|[._-])/i;
const TEXT_KEY = '(?:password|passwd|pwd|[\\w.-]*secret|[\\w.-]*token|api[_-]?key|authorization|proxy-authorization|cookies?|set-cookie|session(?:[_-]?id)?|sid|sessid|phpsessid|sig|signature|[\\w.-]*signature|csrf|xsrf|jwt|code[_-]?verifier|card[_-]?number|pan|cvv|cvc)';
const ASSIGNMENT = new RegExp(`(["']?${TEXT_KEY}["']?\\s*[:=]\\s*)("[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s,;&}]+)`, 'gi');
const QUERY_SECRET = new RegExp(`([?&#;](?:${TEXT_KEY}|code|state|x-amz-credential|x-goog-credential)=)[^&#;\\s"'<>]*`, 'gi');

function secretKey(key, context) {
    const normal = key.replace(/([a-z])([A-Z])/g, '$1_$2');
    return SECRET_KEY.test(normal) || /^(?:access|refresh|id|auth)[_-]?token$/i.test(normal)
        || (/^(?:number|exp_month|exp_year|expiry|expiration)$/i.test(normal) && /(?:^|[._-])card(?:$|[._-])/i.test(context))
        || (/^(?:code|state)$/i.test(normal) && /oauth|query_string|query_params/i.test(context));
}

function isCardNumber(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
        let n = Number(digits[i]);
        if (double) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
        sum += n;
    }
    return sum % 10 === 0;
}

function scrubText(value, context = '') {
    // Bodies and SDK log parameters may already have been serialised.
    if (/^\s*[{[]/.test(value)) {
        try { return JSON.stringify(scrubSecrets(JSON.parse(value), context)); } catch (_) { /* Plain text. */ }
    }
    if (/oauth|query_string|query_params/i.test(context) || /grant_type=authorization_code|code_verifier=/i.test(value)) {
        value = value.replace(/(^|[?&#;])((?:code|state)=)[^&#;\s"'<>]*/gi, '$1$2[Filtered]');
    }
    return value
        .replace(/\b((?:proxy-)?authorization|set-cookie|cookie)\s*:\s*[^\r\n]+/gi, '$1: [Filtered]')
        .replace(/\b(Bearer|Basic)\s+[\w+/=.-]+/gi, '$1 [Filtered]')
        .replace(/([a-z][a-z\d+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/gi, '$1[Filtered]@')
        .replace(QUERY_SECRET, '$1[Filtered]')
        .replace(ASSIGNMENT, '$1[Filtered]')
        .replace(/\b(?:\d[ -]?){12,18}\d\b/g, (match) => isCardNumber(match) ? FILTERED : match);
}

function scrubSecrets(value, context = '', seen = new WeakSet()) {
    if (typeof value === 'string') return scrubText(value, context);
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value.grant_type === 'authorization_code' || value.code_verifier || value.codeVerifier || (value.redirect_uri && value.state)) context += '.oauth';
    const result = Array.isArray(value) ? [] : {};
    for (const [key, item] of Object.entries(value)) {
        result[key] = secretKey(key, context) ? FILTERED : scrubSecrets(item, `${context}.${key}`, seen);
    }
    seen.delete(value);
    return result;
}

module.exports = { scrubSecrets, scrubText };
