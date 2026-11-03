# React Hooks 顽固错误修复指南

> 以下 React 错误是最常见的反复修不好的问题类型。这些错误的修复方式是确定性的，必须严格按本指南执行，不要尝试"绕过"或"变通"。

---

## react-hooks/purity — render 中调用非纯函数

**匹配特征**
- ESLint 报错包含 `react-hooks/purity`
- 报错信息：`Math.random is an impure function` / `Date.now is an impure function`
- 组件函数体内直接调用了 `Math.random()`、`Date.now()`、`fetch()`、`crypto.randomUUID()` 等副作用函数

**核心规则**：React 组件函数体（render 阶段）必须是纯函数 — 相同输入必须产出相同输出。任何不确定性来源都不能在 render 中调用。

### 场景 A：Math.random() 生成随机值

```typescript
// ❌ Bad — 每次 render 产生不同值，导致 hydration mismatch 和无限更新
function Card() {
  const id = Math.random().toString(36).slice(2);
  const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
  return <div id={id} style={{ color }}>...</div>;
}

// ✅ Good — 用 useState 初始化器（只在首次 render 执行一次）
function Card() {
  const [id] = useState(() => Math.random().toString(36).slice(2));
  const [color] = useState(() => `hsl(${Math.random() * 360}, 70%, 60%)`);
  return <div id={id} style={{ color }}>...</div>;
}

// ✅ Good — 用 useId()（React 18+ 推荐，SSR 安全）
function Card() {
  const id = useId();
  return <div id={id}>...</div>;
}
```

### 场景 B：Date.now() / new Date() 获取时间

```typescript
// ❌ Bad — 每次 render 时间不同
function Timer() {
  const now = Date.now();
  const formatted = new Date().toLocaleString();
  return <span>{formatted}</span>;
}

// ✅ Good — 用 useState 初始化 + useEffect 更新
function Timer() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <span>{new Date(now).toLocaleString()}</span>;
}
```

### 场景 C：fetch / API 调用

```typescript
// ❌ Bad — render 中直接 fetch（每次渲染都发请求）
function UserProfile({ userId }: { userId: string }) {
  const data = fetch(`/api/user/${userId}`).then(r => r.json());
  return <div>{data.name}</div>;
}

// ✅ Good — 用 useEffect 发请求
function UserProfile({ userId }: { userId: string }) {
  const [data, setData] = useState<User | null>(null);

  useEffect(() => {
    fetch(`/api/user/${userId}`)
      .then(r => r.json())
      .then(setData);
  }, [userId]);

  if (!data) return <div>Loading...</div>;
  return <div>{data.name}</div>;
}
```

---

## react-hooks/set-state-in-effect — useEffect 内同步 setState

**匹配特征**
- ESLint 报错包含 `react-hooks/set-state-in-effect`
- 报错信息：`Calling setState synchronously within an effect body causes cascading renders`
- `useEffect` 回调内直接调用 `setState(value)`（非在异步回调或订阅中）

**核心规则**：`useEffect` 直接 body 中不要同步调用 `setState`。如果需要根据现有 state 计算新值，应使用派生状态或函数式更新。

### 场景 A：根据 props/state 计算派生值 → 不需要 effect

```typescript
// ❌ Bad — 用 effect 同步 setState 做派生计算
function ProductList({ items }: { items: Product[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0)); // 违规！
  }, [items]);
  return <span>Total: {total}</span>;
}

// ✅ Good — 直接计算派生值（不需要 state 也不需要 effect）
function ProductList({ items }: { items: Product[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return <span>Total: {total}</span>;
}

// ✅ Good — 如果计算量大，用 useMemo
function ProductList({ items }: { items: Product[] }) {
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price, 0),
    [items]
  );
  return <span>Total: {total}</span>;
}
```

### 场景 B：初始化加载数据 → 在异步回调中 setState

```typescript
// ❌ Bad — useEffect body 中同步 setState
useEffect(() => {
  const data = localStorage.getItem('cache');
  setCache(JSON.parse(data || '{}'));  // 同步 setState，违规
}, []);

// ✅ Good — 用 useState 初始化器
const [cache, setCache] = useState(() => {
  const data = localStorage.getItem('cache');
  return JSON.parse(data || '{}');
});

// ✅ Good — 异步操作中的 setState 是允许的
useEffect(() => {
  fetch('/api/data')
    .then(r => r.json())
    .then(data => setCache(data));  // 异步回调中 setState，OK
}, []);
```

### 场景 C：订阅外部数据源 → useSyncExternalStore

```typescript
// ❌ Bad — effect 中同步 setState 来同步外部状态
useEffect(() => {
  const handler = () => setState(externalStore.getState());
  externalStore.subscribe(handler);
  setState(externalStore.getState());  // 同步 setState，违规
  return () => externalStore.unsubscribe(handler);
}, []);

// ✅ Good — useSyncExternalStore（React 18+）
const state = useSyncExternalStore(
  externalStore.subscribe,
  externalStore.getState
);
```

---

## react-hooks/immutability — 直接修改 state/props 对象

**匹配特征**
- ESLint 报错包含 `react-hooks/immutability`
- 直接对 state 对象的属性赋值（`state.x = y`）后 setState
- 直接对数组调用 `.push()` / `.splice()` / `.sort()` 后 setState

**核心规则**：React state 必须视为不可变数据。任何更新都必须创建新引用。

### 对象更新

```typescript
// ❌ Bad — 直接修改对象
const handleChange = (field: string, value: string) => {
  form[field] = value;      // 直接修改！
  setForm(form);            // 同一引用，React 不会重渲染
};

// ✅ Good — 展开运算符创建新对象
const handleChange = (field: string, value: string) => {
  setForm({ ...form, [field]: value });
};

// ✅ Good — 函数式更新
const handleChange = (field: string, value: string) => {
  setForm(prev => ({ ...prev, [field]: value }));
};
```

### 数组更新

```typescript
// ❌ Bad — 直接 push/splice
const addItem = (item: Item) => {
  items.push(item);         // 直接修改数组！
  setItems(items);
};
const removeItem = (index: number) => {
  items.splice(index, 1);   // 直接修改！
  setItems(items);
};

// ✅ Good — 创建新数组
const addItem = (item: Item) => {
  setItems([...items, item]);
};
const removeItem = (index: number) => {
  setItems(items.filter((_, i) => i !== index));
};
const updateItem = (index: number, newItem: Item) => {
  setItems(items.map((item, i) => i === index ? newItem : item));
};
```

### 嵌套对象更新

```typescript
// ❌ Bad — 修改嵌套属性
const updateAddress = (city: string) => {
  user.address.city = city;  // 直接修改嵌套！
  setUser(user);
};

// ✅ Good — 逐层展开
const updateAddress = (city: string) => {
  setUser({
    ...user,
    address: { ...user.address, city }
  });
};
```

### 排序/反转

```typescript
// ❌ Bad — .sort() 和 .reverse() 会就地修改原数组
const sortItems = () => {
  items.sort((a, b) => a.name.localeCompare(b.name));
  setItems(items);
};

// ✅ Good — 先复制再排序
const sortItems = () => {
  setItems([...items].sort((a, b) => a.name.localeCompare(b.name)));
};
```

---

## react-hooks/preserve-manual-memoization — useMemo/useCallback 使用不当

**匹配特征**
- ESLint 报错包含 `react-hooks/preserve-manual-memoization`
- 在 `useMemo` 或 `useCallback` 内部执行了副作用
- 手动 memo 的结果被覆盖或未正确使用

**核心规则**：`useMemo`/`useCallback` 的回调必须是纯计算。不能包含 setState、fetch、DOM 操作等副作用。

```typescript
// ❌ Bad — useMemo 内部有副作用
const data = useMemo(() => {
  setLoading(true);              // 副作用！
  const result = expensiveCalc(items);
  setLoading(false);             // 副作用！
  return result;
}, [items]);

// ✅ Good — useMemo 只做纯计算，副作用放 useEffect
const data = useMemo(() => expensiveCalc(items), [items]);
useEffect(() => {
  setLoading(true);
  // ... loading logic
}, [items]);
```

```typescript
// ❌ Bad — useCallback 返回值被重新包裹（丢失 memo）
const handleClick = useCallback(() => doSomething(id), [id]);
const wrappedHandler = () => handleClick();  // 每次 render 新引用，memo 白做了

// ✅ Good — 直接使用 memoized 函数
const handleClick = useCallback(() => doSomething(id), [id]);
return <Button onClick={handleClick} />;
```

---

## react-hooks/static-components — 组件定义嵌套

**匹配特征**
- ESLint 报错包含 `react-hooks/static-components`
- 在一个组件函数体内定义了另一个组件

**核心规则**：组件定义必须在模块顶层（文件作用域），不能嵌套在另一个组件内部。嵌套定义会导致每次渲染创建新的组件类型，引发不必要的卸载/重挂载。

```typescript
// ❌ Bad — 组件嵌套定义
function ParentComponent({ items }: Props) {
  // 每次 ParentComponent render 都会创建新的 ItemCard "类型"
  function ItemCard({ item }: { item: Item }) {
    return <div>{item.name}</div>;
  }

  return items.map(item => <ItemCard key={item.id} item={item} />);
}

// ✅ Good — 提到模块顶层
function ItemCard({ item }: { item: Item }) {
  return <div>{item.name}</div>;
}

function ParentComponent({ items }: Props) {
  return items.map(item => <ItemCard key={item.id} item={item} />);
}
```

注意：**内联的 render 函数不算组件定义**，以下写法是 OK 的：
```typescript
// ✅ OK — 这是 render 函数，不是组件定义
function ParentComponent({ items }: Props) {
  const renderItem = (item: Item) => <div>{item.name}</div>;
  return items.map(renderItem);
}
```

---

## 变量声明前使用 — Cannot access variable before it is declared

**匹配特征**
- 报错信息包含 `Cannot access variable before it is declared`
- 代码中在 `const`/`let` 声明之前引用了该变量

**核心规则**：`const` 和 `let` 有暂时性死区（TDZ），不会像 `var` 那样提升。在函数组件中，所有 Hook 调用和变量声明必须在使用之前。

```typescript
// ❌ Bad — 在声明前使用
function App() {
  const doubled = count * 2;           // count 还没声明！
  const [count, setCount] = useState(0);
  return <div>{doubled}</div>;
}

// ✅ Good — 先声明，后使用
function App() {
  const [count, setCount] = useState(0);
  const doubled = count * 2;           // count 已声明
  return <div>{doubled}</div>;
}
```

**常见陷阱：函数声明和 Hook 的交叉引用**
```typescript
// ❌ Bad — handleClick 在 useEffect 依赖中，但定义在 useEffect 之后
function App() {
  useEffect(() => {
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [handleClick]);                     // handleClick 还没定义！

  const handleClick = useCallback(() => { ... }, []);
}

// ✅ Good — 调整顺序：先定义，后引用
function App() {
  const handleClick = useCallback(() => { ... }, []);

  useEffect(() => {
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [handleClick]);
}
```

---

## react-hooks/rules-of-hooks — Hook 调用规则

**匹配特征**
- ESLint 报错包含 `react-hooks/rules-of-hooks`
- Hook 在条件语句、循环、嵌套函数中调用

**核心规则**：Hook 必须在组件或自定义 Hook 的**最顶层**调用，不能在条件/循环/嵌套函数中。

```typescript
// ❌ Bad — 条件中调用 Hook
function App({ isAdmin }: Props) {
  if (isAdmin) {
    const [data, setData] = useState(null);  // 违规！
  }
}

// ✅ Good — 无条件调用，条件化使用
function App({ isAdmin }: Props) {
  const [data, setData] = useState(null);
  // 在渲染/逻辑中按条件使用 data
  return isAdmin ? <AdminPanel data={data} /> : <UserPanel />;
}
```

---

## react-hooks/exhaustive-deps — useEffect 依赖不完整

**匹配特征**
- ESLint 报错包含 `react-hooks/exhaustive-deps`
- 报错信息：`React Hook useEffect has a missing dependency: 'xxx'.`

**修复策略**

1. **首选：补全依赖**
```typescript
useEffect(() => { fetchUser(userId); }, [userId]);
```

2. **如果补全依赖导致无限循环 → 稳定化引用**
```typescript
// 问题：对象/函数每次 render 新引用，导致 effect 无限触发
const options = { page: 1, limit: 10 };  // 每次新对象
useEffect(() => { fetchData(options); }, [options]);  // 无限循环！

// ✅ 用 useMemo 稳定对象引用
const options = useMemo(() => ({ page: 1, limit: 10 }), []);
useEffect(() => { fetchData(options); }, [options]);
```

3. **如果确实只需执行一次 → 确认不依赖任何外部值**
```typescript
// ✅ 如果 fetchInitialData 确实不依赖任何 props/state
useEffect(() => {
  fetchInitialData();  // 只在挂载时执行
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
// 必须加注释说明为什么可以忽略
```
