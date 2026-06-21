# js API 使用说明

IdentityOnChain 是实现了数据读写的实例功能，以下的API只适用于该项目，因为其中使用的person对象只适用于该项目。如果需要实现不同类型的数据数据存储，请定义相应的数据对象。

虽然API只适用于该项目，但是通过HTTP进行数据传输的json-rpc格式是不变的。也就是说只需要修改person对象相关的数据即可。

## 文件位置

/IdentityOnChain/src/src/api/identity.js

## Object
person: 如果需要修改person对象的成员，请修改getDefaultPerson，请勿在外部定义person的成员。因为 identity.js 中的 convertIdentityToPerson 会访问 getDefaultPerson。

## API

## createIdentity

javascript

运行

```
export async function createIdentity(person)
```

### Response

* 成功

json

```
{
  "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A"
}
```

* 失败：抛出错误字符串

### Example

javascript

运行

```
try {
  const person = {
    ...getDefaultPerson(),
    hireDate: getCurrentDate(),
  }

  const res = await createIdentity(person);
} catch (error) {
  console.error('failed to add identity:', error);
}
```

---

## searchIdentity

javascript

运行

```
export async function searchIdentity(id)
```

### Response

* 成功：返回 person object
* 失败：抛出错误字符串

### Example

javascript

运行

```
try {
  const person = await searchIdentity(id)
  console.log(person.id, person.name);
} catch (error) {
  console.error('failed to search identity:', error);
}
```

---

## getAllIdentity

javascript

运行

```
export async function getAllIdentity()
```

### Response

* 成功：返回身份 ID 数组

json

```
[id1, id2, id3, …]
```

* 失败：抛出错误字符串

### Example

javascript

运行

```
try{
  const ids = await getAllIdentity()
  for (const i in ids) {
    const person = await searchIdentity(ids[i])
    if (!isPersonRevoked(person)) {
      console.log(person.id, person.name, '\n');
    }
  }
} catch (error) {
  console.error('failed to get all identities:', error);
}
```

---

## updateIdentity

javascript

运行

```
export async function updateIdentity(person)
```

### Response

* 成功

json

```
{
  "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A"
}
```

* 失败：抛出错误字符串

### Example

javascript

运行

```
try {
  //person = …

  person.department = 'finance';
  const res = await updateIdentity(person);
} catch (error) {
  console.error('failed to update identity:', error);
}
```

---

## revokeIdentity

javascript

运行

```
export async function revokeIdentity(id)
```

### Response

* 成功

json

```
{
  "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A"
}
```

* 失败：抛出错误字符串

### Example

javascript

运行

```
try {
  const res = await revokeIdentity(id);
} catch (error) {
  console.error('failed to revoke identity:', error);
}
```

