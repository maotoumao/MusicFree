import React, { useEffect, useMemo, useRef } from "react";
import { FlatList } from "react-native-gesture-handler";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import ListItem from "@/components/base/listItem";
import useOrientation from "@/hooks/useOrientation";
import rpx, { vmax, vmin } from "@/utils/rpx";
import Icon, { IIconName } from "@/components/base/icon.tsx";
import useColors from "@/hooks/useColors.ts";
import ThemeText from "@/components/base/themeText";
import Tip from "@/components/base/tip";
import { iconSizeConst } from "@/constants/uiConst";

interface IKV<T extends string | number = string | number> {
    label: string;
    value: T;
    icon?: IIconName;
}

interface IRadioDialogProps<T extends string | number = string | number> {
    title: string;
    tip?: string;
    content: Array<T | IKV<T>>;
    defaultSelected?: T;
    onOk?: (value: T) => void;
}

function isObject(v: string | number | IKV): v is IKV {
    return !(typeof v === "string" || typeof v === "number");
}

export default function RadioDialog(props: IRadioDialogProps) {
    const { title, content, onOk, defaultSelected, tip } = props;
    const orientation = useOrientation();
    const colors = useColors();
    const ref = useRef<FlatList | null>(null);

    const defaultSelectedIndex = useMemo(() => {
        return content.findIndex(item => {
            if (isObject(item)) {
                return item.value === defaultSelected;
            }
            return item === defaultSelected;
        });
    }, [content, defaultSelected]);


    useEffect(() => {
        if (ref.current && (defaultSelectedIndex - 3) >= 0) {
            ref.current.scrollToIndex({
                index: defaultSelectedIndex - 3,
                animated: false,
            });
        }
    }, []);

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title containerStyle={{ gap: rpx(8) }}>
                <>
                    <ThemeText
                        fontSize="title"
                        fontWeight="bold"
                        numberOfLines={1}>
                        {title}
                    </ThemeText>

                    {tip ? <Tip content={tip} position='top'>
                        <Icon name='question-mark-circle' size={iconSizeConst.light} color={colors.text} />
                    </Tip> : null}
                </>
            </Dialog.Title>

            <FlatList
                ref={ref}
                style={{
                    maxHeight:
                        orientation === "horizontal" ? vmin(60) : vmax(60),
                }}
                data={content}
                getItemLayout={(_, index) => ({
                    length: ListItem.Size.normal,
                    offset: ListItem.Size.normal * index,
                    index,
                })}
                renderItem={({ item }) => {
                    const isConfig = isObject(item);

                    return (
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                if (isConfig) {
                                    onOk?.(item.value);
                                } else {
                                    onOk?.(item);
                                }
                                hideDialog();
                            }}
                            heightType="small">
                            {isConfig && item.icon ? (
                                <ListItem.ListItemIcon icon={item.icon} />
                            ) : null}
                            <ListItem.Content
                                title={isConfig ? item.label : item}
                            />
                            {defaultSelected !== undefined &&
                                defaultSelected ===
                                (isConfig ? item.value : item) ? (
                                    <ListItem.ListItemIcon
                                        icon={"check"}
                                        color={colors.primary}
                                    />
                                ) : null}
                        </ListItem>
                    );
                }}
            />
        </Dialog>
    );
}
