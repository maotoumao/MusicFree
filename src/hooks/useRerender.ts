import { useCallback, useState } from "react";

export default function useRerender() {
    const [, setRerender] = useState(0);

    const rerender = useCallback(() => {
        setRerender((prev) => prev + 1);
    }, []);

    return rerender;
}