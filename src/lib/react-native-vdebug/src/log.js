import React, {Component} from 'react';
import {
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import event from './event';
import {debounce} from './tool';

const LEVEL_ENUM = {
    All: '',
    Log: 'log',
    Info: 'info',
    Warn: 'warn',
    Error: 'error',
};

let logStack = null;

class LogStack {
    constructor() {
        this.logs = [];
        this.maxLength = 200;
        this.listeners = [];
        this.notify = debounce(10, false, this.notify);
    }

    getLogs() {
        return this.logs;
    }

    addLog(method, data) {
        if (this.logs.length > this.maxLength) {
            this.logs.splice(this.logs.length - 1, 1);
        }
        const date = new Date();
        this.logs.splice(0, 0, {
            index: this.logs.length + 1,
            method,
            data: strLog(data),
            time: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`,
            id: unixId(),
        });
        this.notify();
    }

    clearLogs() {
        this.logs = [];
        this.notify();
    }

    notify() {
        this.listeners.forEach(callback => {
            callback();
        });
    }

    attach(callback) {
        this.listeners.push(callback);
    }
}

class Log extends Component {
    constructor(props) {
        super(props);

        this.name = 'Log';
        this.mountState = false;
        this.state = {
            logs: [],
            filterLevel: '',
            // filterValue: ''
        };
        logStack.attach(() => {
            if (this.mountState) {
                const logs = logStack.getLogs();
                this.setState({
                    logs,
                });
            }
        });
    }

    getScrollRef() {
        return this.flatList;
    }

    componentDidMount() {
        this.mountState = true;
        this.setState({
            logs: logStack.getLogs(),
        });
        // 类方法用bind会指向不同地址，导致off失败
        event.on('clear', this.clearLogs);
        event.on('addLog', this.addLog);
    }

    componentWillUnmount() {
        this.mountState = false;
        event.off('clear', this.clearLogs);
        event.off('addLog', this.addLog);
    }

    addLog = msg => {
        logStack.addLog('log', [msg]);
    };

    clearLogs = name => {
        if (name === this.name) {
            logStack.clearLogs();
        }
    };

    ListHeaderComponent() {
        return (
            <View>
                <View style={{flexDirection: 'row', backgroundColor: '#fff'}}>
                    <Text style={styles.headerText}>Index</Text>
                    <Text style={styles.headerText}>Method</Text>
                    <View
                        style={[
                            styles.headerText,
                            {flexDirection: 'row', flex: 2},
                        ]}>
                        {Object.keys(LEVEL_ENUM).map((key, index) => {
                            return (
                                <TouchableOpacity
                                    key={index.toString()}
                                    onPress={() => {
                                        this.setState({
                                            filterLevel: LEVEL_ENUM[key],
                                        });
                                    }}
                                    style={[
                                        styles.headerBtnLevel,
                                        this.state.filterLevel ==
                                            LEVEL_ENUM[key] && {
                                            backgroundColor: '#eeeeee',
                                            borderColor: '#959595a1',
                                            borderWidth: 1,
                                        },
                                    ]}>
                                    <Text style={styles.headerTextLevel}>
                                        {key}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
                <View style={styles.filterValueBar}>
                    <TextInput
                        ref={ref => {
                            this.textInput = ref;
                        }}
                        style={styles.filterValueBarInput}
                        placeholderTextColor={'#000000a1'}
                        placeholder="输入过滤条件..."
                        onSubmitEditing={({nativeEvent}) => {
                            if (nativeEvent) {
                                this.regInstance = new RegExp(
                                    nativeEvent.text,
                                    'ig',
                                );
                                this.setState({filterValue: nativeEvent.text});
                            }
                        }}
                    />
                    <TouchableOpacity
                        style={styles.filterValueBarBtn}
                        onPress={this.clearFilterValue.bind(this)}>
                        <Text>X</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    clearFilterValue() {
        this.setState(
            {
                filterValue: '',
            },
            () => {
                this.textInput.clear();
            },
        );
    }

    renderItem({item}) {
        if (this.state.filterLevel && this.state.filterLevel != item.method)
            return null;
        if (
            this.state.filterValue &&
            this.regInstance &&
            !this.regInstance.test(item.data)
        )
            return null;
        return (
            <TouchableWithoutFeedback
                onLongPress={() => {
                    try {
                        Alert.alert('提示', '复制成功', [{text: '确认'}]);
                    } catch (error) {}
                }}>
                <View style={styles.logItem}>
                    <View style={{flexDirection: 'row'}}>
                        <View style={{flex: 0.8}}>
                            <Text style={styles.logItemTime}>{item.index}</Text>
                        </View>
                        <View style={{flex: 0.8}}>
                            <Text style={styles.logItemTime}>
                                {item.method}
                            </Text>
                        </View>
                        <View style={{flex: 2}}>
                            <Text style={styles.logItemTime}>{item.time}</Text>
                        </View>
                    </View>
                    <Text style={[styles.logItemText, styles[item.method]]}>
                        {item.data}
                    </Text>
                </View>
            </TouchableWithoutFeedback>
        );
    }

    render() {
        return (
            <FlatList
                ref={ref => {
                    this.flatList = ref;
                }}
                legacyImplementation
                // initialNumToRender={20}
                showsVerticalScrollIndicator
                extraData={this.state}
                data={this.state.logs}
                stickyHeaderIndices={[0]}
                ListHeaderComponent={this.ListHeaderComponent.bind(this)}
                renderItem={this.renderItem.bind(this)}
                ListEmptyComponent={() => <Text> Loading...</Text>}
                keyExtractor={item => item.id}
            />
        );
    }
}

const styles = StyleSheet.create({
    log: {
        color: '#000',
    },
    info: {
        color: '#000',
    },
    warn: {
        color: 'orange',
        backgroundColor: '#fffacd',
        borderColor: '#ffb930',
    },
    error: {
        color: '#dc143c',
        backgroundColor: '#ffe4e1',
        borderColor: '#f4a0ab',
    },
    logItem: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: '#eee',
    },
    logItemText: {
        fontSize: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    logItemTime: {
        marginLeft: 5,
        fontSize: 11,
        fontWeight: '700',
    },
    filterValueBarBtn: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eee',
    },
    filterValueBarInput: {
        flex: 1,
        paddingLeft: 10,
        backgroundColor: '#ffffff',
        color: '#000000',
    },
    filterValueBar: {
        flexDirection: 'row',
        height: 40,
        borderWidth: 1,
        borderColor: '#eee',
    },
    headerText: {
        flex: 0.8,
        borderColor: '#eee',
        borderWidth: StyleSheet.hairlineWidth,
        paddingVertical: 4,
        paddingHorizontal: 2,
        fontWeight: '700',
    },
    headerBtnLevel: {
        flex: 1,
        borderColor: '#eee',
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 2,
    },
    headerTextLevel: {
        fontWeight: '700',
        textAlign: 'center',
    },
});

function unixId() {
    return Math.round(Math.random() * 1000000).toString(16);
}

function strLog(logs) {
    const arr = logs.map(data => formatLog(data));
    return arr.join(' ');
}

function formatLog(obj) {
    if (
        obj === null ||
        obj === undefined ||
        typeof obj === 'string' ||
        typeof obj === 'number' ||
        typeof obj === 'boolean' ||
        typeof obj === 'function'
    ) {
        return `"${String(obj)}"`;
    }
    if (obj instanceof Date) {
        return `Date(${obj.toISOString()})`;
    }
    if (Array.isArray(obj)) {
        return `Array(${obj.length})[${obj.map(elem => formatLog(elem))}]`;
    }
    if (obj.toString) {
        try {
            return `object(${JSON.stringify(obj, null, 2)})`;
        } catch (err) {
            return 'Invalid symbol';
        }
    }
    return 'unknown data';
}

export default Log;

export const traceLog = () => {
    if (!logStack) {
        logStack = new LogStack();
    }
};

export const addLog = (level, ...args) => {
    logStack.addLog(level, args);
};
