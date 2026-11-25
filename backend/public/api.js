// public/api.js

const Tokens = {
    setAdmin: (token) => sessionStorage.setItem('admin_token_session', token),
    getAdmin: () => sessionStorage.getItem('admin_token_session'),
    clearAdmin: () => sessionStorage.removeItem('admin_token_session')
};

async function api(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Attach the Admin Token automatically if requested
    if (options.auth === 'admin') {
        const token = Tokens.getAdmin();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const config = {
        method: options.method || 'GET',
        headers: headers,
    };

    if (options.body) {
        config.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, config);
    
    let data;
    try {
        data = await res.json();
    } catch (e) {
        // If the backend crashes (e.g., code error), it won't return JSON
        throw new Error(`Server Error (Status ${res.status}). Check Render Logs!`);
    }

    // Only log out if the server explicitly says 401 (Unauthorized) or 403 (Forbidden)
    if (res.status === 401 || res.status === 403) {
        Tokens.clearAdmin();
        throw new Error('Session expired or invalid token. Please log in again.');
    }

    // If there's another error (like 500), show the real error message from the backend
    if (!res.ok) {
        throw new Error(data.error || 'Unknown server error');
    }
    
    return data;
}
