import useColors from "./useColors";

export default function useTextColor() {
    const colors = useColors();
    return colors.text;
}
