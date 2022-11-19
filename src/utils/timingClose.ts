import NativeUtils from '@/native/utils';
import StateMapper from '@/utils/stateMapper';
import {useEffect, useRef, useState} from 'react';
import BackgroundTimer from 'react-native-background-timer';
// import TrackPlayer from "react-native-track-player";

let deadline: number | null = null;
const stateMapper = new StateMapper(() => deadline);
// let closeAfterPlayEnd = false;
// const closeAfterPlayEndStateMapper = new StateMapper(() => closeAfterPlayEnd);
let timerId: any;

function setTimingClose(_deadline: number | null) {
    deadline = _deadline;
    stateMapper.notify();
    timerId && BackgroundTimer.clearTimeout(timerId);
    if (_deadline) {
        timerId = BackgroundTimer.setTimeout(() => {
            // todo: 播完整首歌再关闭
            NativeUtils.exitApp();
            // if(closeAfterPlayEnd) {
            //     TrackPlayer.addEventListener()
            // } else {
            //     // 立即关闭
            //     NativeUtils.exitApp();
            // }
        }, _deadline - Date.now());
    } else {
        timerId = null;
    }
}

function useTimingClose() {
    const _deadline = stateMapper.useMappedState();
    const [countDown, setCountDown] = useState(
        deadline ? deadline - Date.now() : null,
    );
    const intervalRef = useRef<any>();

    useEffect(() => {
        // deadline改变时，更新定时器
        // 清除原有的定时器
        intervalRef.current && clearInterval(intervalRef.current);
        intervalRef.current = null;

        // 清空定时
        if (!_deadline || _deadline <= Date.now()) {
            setCountDown(null);
            return;
        } else {
            // 更新倒计时
            setCountDown(Math.max(_deadline - Date.now(), 0) / 1000);
            intervalRef.current = setInterval(() => {
                setCountDown(Math.max(_deadline - Date.now(), 0) / 1000);
            }, 1000);
        }
    }, [_deadline]);

    return countDown;
}

export {setTimingClose, useTimingClose};
