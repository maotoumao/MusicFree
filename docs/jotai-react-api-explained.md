# Jotai React API 原理解析

## 目录

1. [概述](#概述)
2. [useStore](#usestore)
3. [Provider](#provider)
4. [useAtomValue](#useatomvalue)
5. [useSetAtom](#usesetatom)
6. [useAtom](#useatom)
7. [工作流程](#工作流程)
8. [最佳实践](#最佳实践)

---

## 概述

Jotai 是一个原始的、灵活的 React 状态管理库。它的核心思想是将状态拆分为小的、独立的原子（atoms），这些原子可以被组合和派生。

Jotai 的 React API 提供了以下核心函数：

- `useStore`: 获取 store 实例
- `Provider`: 提供自定义 store
- `useAtomValue`: 读取 atom 的值
- `useSetAtom`: 获取更新 atom 的函数
- `useAtom`: 同时获取 atom 的值和更新函数

---

## useStore

### 源码分析

```javascript
var useStore = function useStore(options) {
  var store = ReactExports.useContext(StoreContext);
  return (options == null ? void 0 : options.store) || store || vanilla.getDefaultStore();
};
```

### 原理解析

`useStore` 是一个自定义 Hook，用于获取当前组件可用的 store 实例。它的查找策略是：

1. **首先尝试从 options 中获取**：

   - 如果调用时传入了 `options.store`，直接使用这个 store
   - 这允许在组件级别覆盖全局 store
2. **其次尝试从 Context 中获取**：

   - 使用 `ReactExports.useContext(StoreContext)` 获取最近的 Provider 提供的 store
   - 如果组件被包裹在 Provider 中，会使用 Provider 提供的 store
3. **最后使用默认 store**：

   - 如果以上都没有，使用 `vanilla.getDefaultStore()` 获取默认 store
   - 默认 store 是 Jotai 内部创建的单例，用于没有 Provider 的情况

### 使用示例

```javascript
// 使用默认 store
const store = useStore();

// 使用自定义 store
const customStore = useStore({ store: myCustomStore });
```

### 应用场景

1. **多 store 管理**：在复杂应用中，可能需要多个独立的 store
2. **测试场景**：在测试中使用独立的 store，避免状态污染
3. **组件隔离**：为特定组件提供独立的状态空间

---

## Provider

### 源码分析

```javascript
var Provider = function Provider(_ref) {
  var children = _ref.children,
    store = _ref.store;
  var storeRef = ReactExports.useRef();
  if (!store && !storeRef.current) {
    storeRef.current = vanilla.createStore();
  }
  return ReactExports.createElement(StoreContext.Provider, {
    value: store || storeRef.current
  }, children);
};
```

### 原理解析

`Provider` 组件用于为子组件提供自定义的 store 实例。它的工作原理：

1. **接收两个 props**：

   - `children`: 子组件
   - `store`: 可选的自定义 store 实例
2. **使用 useRef 管理 store**：

   - `storeRef` 用于存储 store 实例
   - 使用 ref 而不是 state，确保 store 不会因重渲染而改变
3. **创建 store 的逻辑**：

   - 如果没有传入 `store` 且 `storeRef.current` 不存在，创建新 store
   - 使用 `vanilla.createStore()` 创建新实例
   - 这个逻辑只执行一次，确保 store 的稳定性
4. **通过 Context 传递 store**：

   - 使用 React 的 Context API 将 store 传递给子组件
   - 子组件可以通过 `useContext(StoreContext)` 访问这个 store

### 使用示例

```javascript
// 使用默认创建的 store
<Provider>
  <App />
</Provider>

// 使用自定义 store
const myStore = createStore();
<Provider store={myStore}>
  <App />
</Provider>
```

### 应用场景

1. **应用级别状态管理**：为整个应用提供统一的 store
2. **模块化状态管理**：为不同的功能模块提供独立的 store
3. **服务端渲染**：为每个请求创建独立的 store
4. **状态隔离**：为特定组件树提供独立的状态空间

---

## useAtomValue

### 源码分析

```javascript
function useAtomValue(atom, options) {
  // 1. 获取 store
  var store = useStore(options);

  // 2. 使用 useReducer 管理状态
  var _useReducer = ReactExports.useReducer(function (prev) {
      var nextValue = store.get(atom);
      if (Object.is(prev[0], nextValue) && prev[1] === store && prev[2] === atom) {
        return prev;
      }
      return [nextValue, store, atom];
    }, undefined, function () {
      return [store.get(atom), store, atom];
    }),
    _useReducer$ = _useReducer[0],
    valueFromReducer = _useReducer$[0],
    storeFromReducer = _useReducer$[1],
    atomFromReducer = _useReducer$[2],
    rerender = _useReducer[1];

  // 3. 处理 store 和 atom 变化的情况
  var value = valueFromReducer;
  if (storeFromReducer !== store || atomFromReducer !== atom) {
    rerender();
    value = store.get(atom);
  }

  // 4. 设置延迟更新
  var delay = options == null ? void 0 : options.delay;

  // 5. 订阅 atom 变化
  ReactExports.useEffect(function () {
    var unsub = store.sub(atom, function () {
      if (typeof delay === 'number') {
        setTimeout(rerender, delay);
        return;
      }
      rerender();
    });
    rerender();
    return unsub;
  }, [store, atom, delay]);

  // 6. 调试支持
  ReactExports.useDebugValue(value);

  // 7. 处理 Promise
  return isPromiseLike(value) ? use(value) : value;
}
```

### 原理解析

`useAtomValue` 是一个自定义 Hook，用于读取 atom 的当前值，并在 atom 值变化时触发组件重新渲染。它的工作原理：

#### 1. 获取 Store

```javascript
var store = useStore(options);
```

- 使用 `useStore` 获取当前可用的 store 实例
- 这确保了组件使用正确的 store

#### 2. 使用 useReducer 管理状态

```javascript
var _useReducer = ReactExports.useReducer(
  function (prev) {
    var nextValue = store.get(atom);
    if (Object.is(prev[0], nextValue) && prev[1] === store && prev[2] === atom) {
      return prev;
    }
    return [nextValue, store, atom];
  },
  undefined,
  function () {
    return [store.get(atom), store, atom];
  }
);
```

这个设计非常巧妙：

- **初始状态**：通过第三个参数（init 函数）设置初始值为 `[store.get(atom), store, atom]`

  - 第一个元素：atom 的当前值
  - 第二个元素：store 实例
  - 第三个元素：atom 本身
- **reducer 函数**：

  - 每次调用时，获取 atom 的新值
  - 使用 `Object.is` 比新旧值是否相同
  - 只有当值、store 或 atom 改变时才更新状态
  - 这避免了不必要的重渲染
- **返回值**：

  - `valueFromReducer`: atom 的值
  - `storeFromReducer`: store 实例
  - `atomFromReducer`: atom
  - `rerender`: 触发重渲染的函数

#### 3. 处理 Store 和 Atom 变化

```javascript
var value = valueFromReducer;
if (storeFromReducer !== store || atomFromReducer !== atom) {
  rerender();
  value = store.get(atom);
}
```

- 检查 store 或 atom 是否改变
- 如果改变，立即触发重渲染
- 重新获取 atom 的值

#### 4. 订阅 Atom 变化

```javascript
ReactExports.useEffect(function () {
  var unsub = store.sub(atom, function () {
    if (typeof delay === 'number') {
      setTimeout(rerender, delay);
      return;
    }
    rerender();
  });
  rerender();
  return unsub;
}, [store, atom, delay]);
```

这是核心的订阅机制：

- **订阅变化**：

  - 使用 `store.sub(atom, callback)` 订阅 atom 的变化
  - 当 atom 值改变时，调用回调函数
- **延迟更新**：

  - 如果设置了 `delay` 选项，使用 `setTimeout` 延迟重渲染
  - 这可以用于防抖场景
- **立即同步**：

  - 订阅后立即调用 `rerender()` 确保状态同步
  - 这解决了初始渲染时可能的状态不一致问题
- **清理订阅**：

  - 返回 `unsub` 函数，在组件卸载时取消订阅
  - 防止内存泄漏

#### 5. 处理 Promise

```javascript
return isPromiseLike(value) ? use(value) : value;
```

- 如果 atom 的值是 Promise，使用 `use` 处理
- `use` 是 React 的实验性 API，用于处理异步状态
- 这支持了 Jotai 的异步 atom 功能

### 使用示例

```javascript
// 基本使用
const countAtom = atom(0);
function Counter() {
  const count = useAtomValue(countAtom);
  return <div>{count}</div>;
}

// 带延迟
const dataAtom = atom(async () => {
  const res = await fetch('/api/data');
  return res.json();
});
function DataDisplay() {
  const data = useAtomValue(dataAtom, { delay: 300 });
  return <div>{JSON.stringify(data)}</div>;
}
```

### 应用场景

1. **只读状态**：只需要读取 atom 的值，不需要修改
2. **派生状态**：基于其他 atom 计算出的状态
3. **异步状态**：处理异步数据加载
4. **性能优化**：避免不必要的重渲染

---

## useSetAtom

### 源码分析

```javascript
function useSetAtom(atom, options) {
  var store = useStore(options);
  var setAtom = ReactExports.useCallback(function () {
    if (process.env.NODE_ENV !== 'production' && !('write' in atom)) {
      throw new Error('not writable atom');
    }
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    return store.set.apply(store, [atom].concat(args));
  }, [store, atom]);
  return setAtom;
}
```

### 原理解析

`useSetAtom` 是一个自定义 Hook，用于获取更新 atom 的函数。它的工作原理：

#### 1. 获取 Store

```javascript
var store = useStore(options);
```

- 使用 `useStore` 获取当前可用的 store 实例

#### 2. 创建更新函数

```javascript
var setAtom = ReactExports.useCallback(function () {
  // 开发环境检查
  if (process.env.NODE_ENV !== 'production' && !('write' in atom)) {
    throw new Error('not writable atom');
  }

  // 收集参数
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  // 调用 store.set
  return store.set.apply(store, [atom].concat(args));
}, [store, atom]);
```

这个函数的关键点：

- **开发环境检查**：

  - 检查 atom 是否有 `write` 属性
  - 如果没有，抛出错误，防止尝试写入只读 atom
- **参数收集**：

  - 使用 `arguments` 对象收集所有传入的参数
  - 这支持了灵活的参数传递
- **调用 store.set**：

  - 使用 `apply` 方法调用 `store.set`
  - 将 atom 和参数一起传递
  - 返回 `store.set` 的返回值（可能是 Promise）
- **使用 useCallback**：

  - 缓存函数，避免每次渲染都创建新函数
  - 依赖项是 `store` 和 `atom`
  - 这确保了函数引用的稳定性

### 使用示例

```javascript
// 基本使用
const countAtom = atom(0);
function Counter() {
  const setCount = useSetAtom(countAtom);
  return <button onClick={() => setCount(c => c + 1)}>增加</button>;
}

// 带参数的 atom
const messageAtom = atom('');
function MessageInput() {
  const setMessage = useSetAtom(messageAtom);
  return <input onChange={e => setMessage(e.target.value)} />;
}

// 异步 atom
const dataAtom = atom(null);
function DataLoader() {
  const setData = useSetAtom(dataAtom);
  const loadData = async () => {
    const res = await fetch('/api/data');
    const data = await res.json();
    setData(data);
  };
  return <button onClick={loadData}>加载数据</button>;
}
```

### 应用场景

1. **只写操作**：只需要更新 atom，不需要读取
2. **事件处理**：在事件处理函数中更新状态
3. **性能优化**：避免因读取 atom 导致的不必要重渲染
4. **类型安全**：TypeScript 中可以明确只获取 setter 函数

---

## useAtom

### 源码分析

```javascript
function useAtom(atom, options) {
  return [useAtomValue(atom, options), useSetAtom(atom, options)];
}
```

### 原理解析

`useAtom` 是一个组合 Hook，它同时返回 atom 的值和更新函数。它的实现非常简单：

1. 调用 `useAtomValue` 获取 atom 的当前值
2. 调用 `useSetAtom` 获取更新 atom 的函数
3. 将两者作为数组返回

这种设计遵循了 React 的模式，类似于 `useState` 的返回值。

### 使用示例

```javascript
// 基本使用
const countAtom = atom(0);
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return (
    <div>
      <div>{count}</div>
      <button onClick={() => setCount(c => c + 1)}>增加</button>
      <button onClick={() => setCount(c => c - 1)}>减少</button>
    </div>
  );
}

// 派生 atom
const doubleCountAtom = atom((get) => get(countAtom) * 2);
function DoubleCounter() {
  const [doubleCount] = useAtom(doubleCountAtom);
  return <div>双倍计数: {doubleCount}</div>;
}

// 异步 atom
const userAtom = atom(async () => {
  const res = await fetch('/api/user');
  return res.json();
});
function UserProfile() {
  const [user] = useAtom(userAtom);
  if (!user) return <div>加载中...</div>;
  return <div>用户: {user.name}</div>;
}
```

### 应用场景

1. **同时读写**：需要同时读取和更新 atom
2. **简单状态**：类似于 useState 的使用方式
3. **表单处理**：表单输入和显示
4. **状态同步**：多个组件共享和修改同一状态

---

## 工作流程

### 完整的状态管理流程

```
1. 创建 Atom
   ↓
2. 使用 Provider 包裹应用（可选）
   ↓
3. 在组件中使用 useAtom/useAtomValue/useSetAtom
   ↓
4. 组件订阅 atom 变化
   ↓
5. atom 值变化时触发重渲染
   ↓
6. 组件卸载时取消订阅
```

### 详细步骤

#### 步骤 1: 创建 Atom

```javascript
const countAtom = atom(0);
```

- 创建一个初始值为 0 的 atom
- atom 是一个包含元数据的对象
- atom 本身不存储值，值存储在 store 中

#### 步骤 2: 使用 Provider（可选）

```javascript
<Provider>
  <App />
</Provider>
```

- 为应用提供 store
- 如果不使用 Provider，会使用默认 store
- 可以创建多个 Provider 实现状态隔离

#### 步骤 3: 在组件中使用

```javascript
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return <div>{count}</div>;
}
```

- 组件通过 `useAtom` 订阅 atom
- `useAtomValue` 负责读取和订阅
- `useSetAtom` 负责更新

#### 步骤 4: 订阅机制

```javascript
store.sub(atom, callback);
```

- 组件通过 `store.sub` 订阅 atom
- 当 atom 值变化时，调用回调函数
- 回调函数触发组件重渲染

#### 步骤 5: 更新机制

```javascript
setCount(1);
```

- 调用 `setCount` 更新 atom
- `store.set` 被调用
- atom 的值在 store 中更新
- 通知所有订阅者

#### 步骤 6: 重渲染

```javascript
rerender();
```

- 订阅者收到通知
- 触发 `useReducer` 的 dispatch
- 组件重新渲染
- 显示新的值

#### 步骤 7: 清理

```javascript
return unsub;
```

- 组件卸载时调用
- 取消订阅
- 防止内存泄漏

---

## 最佳实践

### 1. 合理拆分 Atom

```javascript
// ❌ 不好：一个大对象
const stateAtom = atom({
  user: null,
  posts: [],
  settings: {}
});

// ✅ 好：拆分成多个小 atom
const userAtom = atom(null);
const postsAtom = atom([]);
const settingsAtom = atom({});
```

### 2. 使用派生 Atom

```javascript
// 基础 atom
const countAtom = atom(0);

// 派生 atom
const doubleCountAtom = atom((get) => get(countAtom) * 2);
const isEvenAtom = atom((get) => get(countAtom) % 2 === 0);
```

### 3. 只读和只写 Atom

```javascript
// 只读 atom
const readOnlyAtom = atom((get) => get(sourceAtom) * 2);

// 只写 atom
const writeOnlyAtom = atom(null, (get, set, newValue) => {
  set(sourceAtom, newValue * 2);
});

// 使用
const value = useAtomValue(readOnlyAtom);
const setValue = useSetAtom(writeOnlyAtom);
```

### 4. 异步 Atom

```javascript
const dataAtom = atom(async (get) => {
  const id = get(idAtom);
  const response = await fetch(`/api/data/${id}`);
  return response.json();
});
```

### 5. 性能优化

```javascript
// ✅ 使用 useAtomValue 避免不必要的重渲染
function Display() {
  const value = useAtomValue(valueAtom);
  return <div>{value}</div>;
}

// ✅ 使用 useSetAtom 避免因读取导致的重渲染
function UpdateButton() {
  const setValue = useSetAtom(valueAtom);
  return <button onClick={() => setValue(Math.random())}>更新</button>;
}
```

### 6. 错误处理

```javascript
const errorAtom = atom(null);
const dataAtom = atom(
  async (get) => {
    try {
      const res = await fetch('/api/data');
      return res.json();
    } catch (error) {
      set(errorAtom, error);
      throw error;
    }
  }
);
```

### 7. 测试友好

```javascript
// 测试中使用独立的 store
const testStore = createStore();
function TestComponent() {
  const [value, setValue] = useAtom(testAtom, { store: testStore });
  // ...
}
```

---

## 总结

Jotai 的 React API 设计简洁而强大：

1. **useStore**: 灵活的 store 获取机制
2. **Provider**: 可选的状态容器
3. **useAtomValue**: 高效的值读取和订阅
4. **useSetAtom**: 类型安全的更新函数
5. **useAtom**: 便捷的组合 Hook

这些函数共同构成了一个灵活、高效的状态管理系统，适用于各种规模的应用。通过合理使用这些 API，可以构建出性能优异、易于维护的应用。
