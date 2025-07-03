import useColors from "./useColors";

export default function usePrimaryColor() {
    const colors = useColors();
    return colors.primary;
}
