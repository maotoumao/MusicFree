export default function (time: number) {
    time = Math.round(time);
    if (time < 60) {
        return `00:${time.toFixed(0).padStart(2, "0")}`;
    }
    const sec = Math.floor(time % 60);
    time = Math.floor(time / 60);
    const min = time % 60;
    time = Math.floor(time / 60);
    const formatted = `${min.toString().padStart(2, "0")}:${sec
        .toFixed(0)
        .padStart(2, "0")}`;
    if (time === 0) {
        return formatted;
    }

    return `${time}:${formatted}`;
}
