import {useCallback, useEffect, useRef, useState} from 'react';

export function useOnMounted() {
    const onMounted = useRef(false);
    const [isLoading, setLoading] = useState(true);

    useEffect(() => {
        onMounted.current = true;
        setTimeout(() => {
            setLoading(false);
        });

        return () => {
            onMounted.current = false;
        };
    }, []);

    return {onMounted: useCallback(() => onMounted.current, []), isLoading};
}
