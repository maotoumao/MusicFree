// 由 scripts/icons.mjs 生成，请勿手改（增删图标改这里跑一次脚本）
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';

import ALargeSmallIcon from '@/assets/icons/a-large-small.svg';
import ArrowUpDownIcon from '@/assets/icons/arrow-up-down.svg';
import ArrowUpToLineIcon from '@/assets/icons/arrow-up-to-line.svg';
import AudioLinesIcon from '@/assets/icons/audio-lines.svg';
import BookOpenIcon from '@/assets/icons/book-open.svg';
import BrandBilibiliIcon from '@/assets/icons/brand-bilibili.svg';
import BrandWechatIcon from '@/assets/icons/brand-wechat.svg';
import BrandXiaohongshuIcon from '@/assets/icons/brand-xiaohongshu.svg';
import CaptionsIcon from '@/assets/icons/captions.svg';
import CheckIcon from '@/assets/icons/check.svg';
import ChevronDownIcon from '@/assets/icons/chevron-down.svg';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import ChevronUpIcon from '@/assets/icons/chevron-up.svg';
import CircleCheckIcon from '@/assets/icons/circle-check.svg';
import CircleHelpIcon from '@/assets/icons/circle-help.svg';
import CircleXIcon from '@/assets/icons/circle-x.svg';
import ClockIcon from '@/assets/icons/clock.svg';
import CloudDownloadIcon from '@/assets/icons/cloud-download.svg';
import CodeIcon from '@/assets/icons/code.svg';
import CopyIcon from '@/assets/icons/copy.svg';
import CornerDownRightIcon from '@/assets/icons/corner-down-right.svg';
import DatabaseIcon from '@/assets/icons/database.svg';
import Disc3Icon from '@/assets/icons/disc-3.svg';
import DownloadIcon from '@/assets/icons/download.svg';
import EllipsisVerticalIcon from '@/assets/icons/ellipsis-vertical.svg';
import ExternalLinkIcon from '@/assets/icons/external-link.svg';
import FlameIcon from '@/assets/icons/flame.svg';
import FolderOpenIcon from '@/assets/icons/folder-open.svg';
import FolderPlusIcon from '@/assets/icons/folder-plus.svg';
import GaugeIcon from '@/assets/icons/gauge.svg';
import GripVerticalIcon from '@/assets/icons/grip-vertical.svg';
import HeartIcon from '@/assets/icons/heart.svg';
import HeartFilledIcon from '@/assets/icons/heart-filled.svg';
import HistoryIcon from '@/assets/icons/history.svg';
import HouseIcon from '@/assets/icons/house.svg';
import IdCardIcon from '@/assets/icons/id-card.svg';
import ImageIcon from '@/assets/icons/image.svg';
import ImportIcon from '@/assets/icons/import.svg';
import InboxIcon from '@/assets/icons/inbox.svg';
import InfoIcon from '@/assets/icons/info.svg';
import LanguagesIcon from '@/assets/icons/languages.svg';
import LinkIcon from '@/assets/icons/link.svg';
import ListChecksIcon from '@/assets/icons/list-checks.svg';
import ListEndIcon from '@/assets/icons/list-end.svg';
import ListMusicIcon from '@/assets/icons/list-music.svg';
import ListStartIcon from '@/assets/icons/list-start.svg';
import LoaderCircleIcon from '@/assets/icons/loader-circle.svg';
import LocateFixedIcon from '@/assets/icons/locate-fixed.svg';
import LogOutIcon from '@/assets/icons/log-out.svg';
import MenuIcon from '@/assets/icons/menu.svg';
import MessageCircleIcon from '@/assets/icons/message-circle.svg';
import MoonIcon from '@/assets/icons/moon.svg';
import PaletteIcon from '@/assets/icons/palette.svg';
import PauseIcon from '@/assets/icons/pause.svg';
import PencilIcon from '@/assets/icons/pencil.svg';
import PlayIcon from '@/assets/icons/play.svg';
import PlusIcon from '@/assets/icons/plus.svg';
import PuzzleIcon from '@/assets/icons/puzzle.svg';
import QrCodeIcon from '@/assets/icons/qr-code.svg';
import RefreshCwIcon from '@/assets/icons/refresh-cw.svg';
import RepeatIcon from '@/assets/icons/repeat.svg';
import Repeat1Icon from '@/assets/icons/repeat-1.svg';
import RouteIcon from '@/assets/icons/route.svg';
import RssIcon from '@/assets/icons/rss.svg';
import SearchIcon from '@/assets/icons/search.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import Share2Icon from '@/assets/icons/share-2.svg';
import ShuffleIcon from '@/assets/icons/shuffle.svg';
import SkipBackIcon from '@/assets/icons/skip-back.svg';
import SkipForwardIcon from '@/assets/icons/skip-forward.svg';
import SlidersVerticalIcon from '@/assets/icons/sliders-vertical.svg';
import SunIcon from '@/assets/icons/sun.svg';
import SunMoonIcon from '@/assets/icons/sun-moon.svg';
import Trash2Icon from '@/assets/icons/trash-2.svg';
import TriangleAlertIcon from '@/assets/icons/triangle-alert.svg';
import TrophyIcon from '@/assets/icons/trophy.svg';
import UserRoundIcon from '@/assets/icons/user-round.svg';
import VariableIcon from '@/assets/icons/variable.svg';
import XIcon from '@/assets/icons/x.svg';

export type IconName =
    | 'a-large-small'
    | 'arrow-up-down'
    | 'arrow-up-to-line'
    | 'audio-lines'
    | 'book-open'
    | 'brand-bilibili'
    | 'brand-wechat'
    | 'brand-xiaohongshu'
    | 'captions'
    | 'check'
    | 'chevron-down'
    | 'chevron-left'
    | 'chevron-right'
    | 'chevron-up'
    | 'circle-check'
    | 'circle-help'
    | 'circle-x'
    | 'clock'
    | 'cloud-download'
    | 'code'
    | 'copy'
    | 'corner-down-right'
    | 'database'
    | 'disc-3'
    | 'download'
    | 'ellipsis-vertical'
    | 'external-link'
    | 'flame'
    | 'folder-open'
    | 'folder-plus'
    | 'gauge'
    | 'grip-vertical'
    | 'heart'
    | 'heart-filled'
    | 'history'
    | 'house'
    | 'id-card'
    | 'image'
    | 'import'
    | 'inbox'
    | 'info'
    | 'languages'
    | 'link'
    | 'list-checks'
    | 'list-end'
    | 'list-music'
    | 'list-start'
    | 'loader-circle'
    | 'locate-fixed'
    | 'log-out'
    | 'menu'
    | 'message-circle'
    | 'moon'
    | 'palette'
    | 'pause'
    | 'pencil'
    | 'play'
    | 'plus'
    | 'puzzle'
    | 'qr-code'
    | 'refresh-cw'
    | 'repeat'
    | 'repeat-1'
    | 'route'
    | 'rss'
    | 'search'
    | 'settings'
    | 'share-2'
    | 'shuffle'
    | 'skip-back'
    | 'skip-forward'
    | 'sliders-vertical'
    | 'sun'
    | 'sun-moon'
    | 'trash-2'
    | 'triangle-alert'
    | 'trophy'
    | 'user-round'
    | 'variable'
    | 'x';

export const iconMap: Record<IconName, FC<SvgProps>> = {
    'a-large-small': ALargeSmallIcon,
    'arrow-up-down': ArrowUpDownIcon,
    'arrow-up-to-line': ArrowUpToLineIcon,
    'audio-lines': AudioLinesIcon,
    'book-open': BookOpenIcon,
    'brand-bilibili': BrandBilibiliIcon,
    'brand-wechat': BrandWechatIcon,
    'brand-xiaohongshu': BrandXiaohongshuIcon,
    captions: CaptionsIcon,
    check: CheckIcon,
    'chevron-down': ChevronDownIcon,
    'chevron-left': ChevronLeftIcon,
    'chevron-right': ChevronRightIcon,
    'chevron-up': ChevronUpIcon,
    'circle-check': CircleCheckIcon,
    'circle-help': CircleHelpIcon,
    'circle-x': CircleXIcon,
    clock: ClockIcon,
    'cloud-download': CloudDownloadIcon,
    code: CodeIcon,
    copy: CopyIcon,
    'corner-down-right': CornerDownRightIcon,
    database: DatabaseIcon,
    'disc-3': Disc3Icon,
    download: DownloadIcon,
    'ellipsis-vertical': EllipsisVerticalIcon,
    'external-link': ExternalLinkIcon,
    flame: FlameIcon,
    'folder-open': FolderOpenIcon,
    'folder-plus': FolderPlusIcon,
    gauge: GaugeIcon,
    'grip-vertical': GripVerticalIcon,
    heart: HeartIcon,
    'heart-filled': HeartFilledIcon,
    history: HistoryIcon,
    house: HouseIcon,
    'id-card': IdCardIcon,
    image: ImageIcon,
    import: ImportIcon,
    inbox: InboxIcon,
    info: InfoIcon,
    languages: LanguagesIcon,
    link: LinkIcon,
    'list-checks': ListChecksIcon,
    'list-end': ListEndIcon,
    'list-music': ListMusicIcon,
    'list-start': ListStartIcon,
    'loader-circle': LoaderCircleIcon,
    'locate-fixed': LocateFixedIcon,
    'log-out': LogOutIcon,
    menu: MenuIcon,
    'message-circle': MessageCircleIcon,
    moon: MoonIcon,
    palette: PaletteIcon,
    pause: PauseIcon,
    pencil: PencilIcon,
    play: PlayIcon,
    plus: PlusIcon,
    puzzle: PuzzleIcon,
    'qr-code': QrCodeIcon,
    'refresh-cw': RefreshCwIcon,
    repeat: RepeatIcon,
    'repeat-1': Repeat1Icon,
    route: RouteIcon,
    rss: RssIcon,
    search: SearchIcon,
    settings: SettingsIcon,
    'share-2': Share2Icon,
    shuffle: ShuffleIcon,
    'skip-back': SkipBackIcon,
    'skip-forward': SkipForwardIcon,
    'sliders-vertical': SlidersVerticalIcon,
    sun: SunIcon,
    'sun-moon': SunMoonIcon,
    'trash-2': Trash2Icon,
    'triangle-alert': TriangleAlertIcon,
    trophy: TrophyIcon,
    'user-round': UserRoundIcon,
    variable: VariableIcon,
    x: XIcon,
};
