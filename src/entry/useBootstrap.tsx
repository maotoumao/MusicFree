import useCheckUpdate from '@/hooks/useCheckUpdate';
import {useListenOrientationChange} from '@/hooks/useOrientation';

export default function () {
    useListenOrientationChange();
    useCheckUpdate();
}
