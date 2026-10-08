import { useEffect, useState } from 'react';
import { fetchApiStatus, type ApiStatus } from './lib/health.js';

const statusText: Record<ApiStatus, string> = {
    checking: 'Checking API…',
    available: 'API available',
    unavailable: 'API unavailable',
};

export const App = () => {
    const [status, setStatus] = useState<ApiStatus>('checking');

    useEffect(() => {
        const controller = new AbortController();
        fetchApiStatus(controller.signal).then(setStatus, () => undefined);
        return () => controller.abort();
    }, []);

    return (
        <main>
            <h1>YelpCamp</h1>
            <p role="status">{statusText[status]}</p>
        </main>
    );
};
