import { TrackPlayerEvents } from "@/core.defination/trackPlayer";
import TrackPlayer from "@/core/trackPlayer";
import NativeUtils from "@/native/utils";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import BackgroundTimer from "react-native-background-timer";


const deadlineAtom = atom<number | null>(null);
const closeAfterPlayEndAtom = atom(false);

let timerId: any;


async function exitApp() {
    await TrackPlayer.reset();
    NativeUtils.exitApp();
}

function setScheduleClose(deadline: number | null) {
    getDefaultStore().set(deadlineAtom, deadline);
    timerId && BackgroundTimer.clearTimeout(timerId);
    if (deadline && deadline > Date.now()) {
        timerId = BackgroundTimer.setTimeout(async () => {
            const playAfterEnd = getDefaultStore().get(closeAfterPlayEndAtom);
            if (playAfterEnd) {
                TrackPlayer.on(TrackPlayerEvents.PlayEnd, exitApp);
            } else {
                exitApp();
            }

        }, deadline - Date.now());
    } else {
        if (timerId) {
            BackgroundTimer.clearTimeout(timerId);
        }
        timerId = null;
    }
}

function setCloseAfterPlayEnd(closeAfterPlayEnd: boolean) {
    if (!closeAfterPlayEnd) {
        // 边界条件：如果倒计时结束后，Trackplayer停止播放前，取消了修改
        TrackPlayer.off(TrackPlayerEvents.PlayEnd, exitApp);
    }
    getDefaultStore().set(closeAfterPlayEndAtom, closeAfterPlayEnd);
}

function useScheduleCloseCountDown() {
    const deadline = useAtomValue(deadlineAtom);

    const [countDown, setCountDown] = useState(
        deadline ? deadline - Date.now() : null);

    const intervalRef = useRef<any>();

    useEffect(() => {
        // deadline改变时，更新定时器
        // 清除原有的定时器
        intervalRef.current && clearInterval(intervalRef.current);
        intervalRef.current = null;

        // 清空定时
        if (!deadline || deadline <= Date.now()) {
            setCountDown(null);
            return;
        } else {
            // 更新倒计时
            setCountDown(Math.max(deadline - Date.now(), 0) / 1000);
            intervalRef.current = setInterval(() => {
                setCountDown(Math.max(deadline - Date.now(), 0) / 1000);
            }, 1000);
        }

        return () => {
            // 清除定时器
            intervalRef.current && clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [deadline]);

    return countDown;
}


const useCloseAfterPlayEnd = () => useAtomValue(closeAfterPlayEndAtom);


export { setScheduleClose, useScheduleCloseCountDown, setCloseAfterPlayEnd, useCloseAfterPlayEnd };
