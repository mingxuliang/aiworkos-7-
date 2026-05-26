---
title: 默认模块
language_tabs:
  - shell: Shell
  - http: HTTP
  - javascript: JavaScript
  - ruby: Ruby
  - python: Python
  - php: PHP
  - java: Java
  - go: Go
toc_footers: []
includes: []
search: true
code_clipboard: true
highlight_theme: darkula
headingLevel: 2
generator: "@tarslib/widdershins v4.0.30"

---

# 默认模块

Base URLs:

* <a href="http://101.36.143.21:8088/">测试环境: http://101.36.143.21:8088/</a>

# Authentication

# 部门管理

## POST 添加组织结构节点

POST /api/departments

> Body 请求参数

```json
{
  "parent_id": 16,
  "department_name": "测试删除2",
  "position_title": "总监",
  "ai_empowerment_level": 1,
  "efficiency_improvement_percent": 50,
  "job_desc": "测试任务描述",
  "sub_jobs": [
    {
      "job_title": "需求分析",
      "job_desc": "明确任务开发需求",
      "agent_id": "BXECF",
      "manual_task": "制定需求",
      "agent_task": "需求拆解，制定落地方案"
    },
    {
      "job_title": "任务指派",
      "job_desc": "任务下发到个人",
      "agent_id": "CCCC",
      "manual_task": "任务下发",
      "agent_task": "无"
    },
    {
      "job_title": "任务验收",
      "job_desc": "验收开发成果",
      "agent_id": "SSSSS",
      "manual_task": "按需求文档和任务进度要求验收",
      "agent_task": "code review"
    },
  ]
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|
|body|body|object| 是 |none|

> 返回示例

> 200 Response

```json
{
    "id": 18,
    "parent_id": 16,
    "department_name": "测试删除2",
    "position_title": "总监",
    "ai_empowerment_level": 1,
    "efficiency_improvement_percent": 50,
    "job_desc": "测试任务描述",
    "sub_jobs": [
        {
            "id": 14,
            "department_id": 18,
            "job_title": "需求分析",
            "job_desc": "明确任务开发需求",
            "agent_id": "BXECF",
            "manual_task": "制定需求",
            "agent_task": "需求拆解，制定落地方案"
        },
        {
            "id": 15,
            "department_id": 18,
            "job_title": "任务指派",
            "job_desc": "任务下发到个人",
            "agent_id": "CCCC",
            "manual_task": "任务下发",
            "agent_task": "无"
        },
        {
            "id": 16,
            "department_id": 18,
            "job_title": "任务验收",
            "job_desc": "验收开发成果",
            "agent_id": "SSSSS",
            "manual_task": "按需求文档和任务进度要求验收",
            "agent_task": "code review"
        }
    ]
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## PUT 修改组织架构节点

PUT /api/departments

> Body 请求参数

```json
{
    "id": 16,
    "department_name": "AIWork-OS开发部2",
    "position_title": "技术负责人2",
    "ai_empowerment_level": 2,
    "efficiency_improvement_percent": 90,
    "job_desc": "AIWork-OS开发和推广",
    "sub_jobs": [
        {
            "job_title": "需求分析",
            "job_desc": "明确任务开发需求",
            "agent_id": "BXECF",
            "manual_task": "制定需求",
            "agent_task": "需求拆解，制定落地方案"
        },
        {
            "job_title": "任务指派",
            "job_desc": "任务下发到个人",
            "agent_id": "CCCC",
            "manual_task": "任务下发",
            "agent_task": "无"
        },
        {
            "job_title": "任务验收",
            "job_desc": "验收开发成果",
            "agent_id": "SSSSS",
            "manual_task": "按需求文档和任务进度要求验收",
            "agent_task": "code review"
        }
    ]
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|
|body|body|object| 是 |none|

> 返回示例

> 200 Response

```json
{
    "id": 16,
    "parent_id": 5,
    "department_name": "AIWork-OS开发部2",
    "position_title": "技术负责人2",
    "ai_empowerment_level": 2,
    "efficiency_improvement_percent": 90,
    "job_desc": "AIWork-OS开发和推广",
    "sub_jobs": [
        {
            "id": 8,
            "department_id": 16,
            "job_title": "需求分析",
            "job_desc": "明确任务开发需求",
            "agent_id": "BXECF",
            "manual_task": "制定需求",
            "agent_task": "需求拆解，制定落地方案"
        },
        {
            "id": 9,
            "department_id": 16,
            "job_title": "任务指派",
            "job_desc": "任务下发到个人",
            "agent_id": "CCCC",
            "manual_task": "任务下发",
            "agent_task": "无"
        },
        {
            "id": 10,
            "department_id": 16,
            "job_title": "任务验收",
            "job_desc": "验收开发成果",
            "agent_id": "SSSSS",
            "manual_task": "按需求文档和任务进度要求验收",
            "agent_task": "code review"
        }
    ]
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## DELETE 删除组织结构节点

DELETE /api/departments/{department_id}

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|department_id|path|integer| 是 |none|
|Authorization|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{"message":"Department deleted"}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## GET 查看组织节点信息

GET /api/departments/{department_id}

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|department_id|path|integer| 是 |none|
|Authorization|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{
    "id": 16,
    "parent_id": 5,
    "department_name": "AIWork-OS开发部2",
    "position_title": "技术负责人2",
    "ai_empowerment_level": 2,
    "efficiency_improvement_percent": 90,
    "job_desc": "AIWork-OS开发和推广",
    "sub_jobs": [
        {
            "id": 8,
            "department_id": 16,
            "job_title": "需求分析",
            "job_desc": "明确任务开发需求",
            "agent_id": "BXECF",
            "manual_task": "制定需求",
            "agent_task": "需求拆解，制定落地方案"
        },
        {
            "id": 9,
            "department_id": 16,
            "job_title": "任务指派",
            "job_desc": "任务下发到个人",
            "agent_id": "CCCC",
            "manual_task": "任务下发",
            "agent_task": "无"
        },
        {
            "id": 10,
            "department_id": 16,
            "job_title": "任务验收",
            "job_desc": "验收开发成果",
            "agent_id": "SSSSS",
            "manual_task": "按需求文档和任务进度要求验收",
            "agent_task": "code review"
        }
    ]
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## GET 部门列表（给用户管理页面用）

GET /api/departments/list

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{"departments":[{"id":1,"department_name":"董事长"},{"id":2,"department_name":"销售部"},{"id":3,"department_name":"运营部mod"},{"id":4,"department_name":"北京运营中心"},{"id":5,"department_name":"技术部"},{"id":6,"department_name":"AIWork-OS开发部"},{"id":7,"department_name":"测试删除"},{"id":8,"department_name":"测试删除1"},{"id":9,"department_name":"测试删除1"},{"id":10,"department_name":"测试删除1"},{"id":11,"department_name":"测试删除1"},{"id":12,"department_name":"测试删除1"}]}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## GET 组织架构树状结构

GET /api/departments/tree

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{
    "root": {
        "id": 1,
        "parent_id": null,
        "department_name": "董事长",
        "position_title": "张总",
        "ai_empowerment_level": 2,
        "efficiency_improvement_percent": 100,
        "job_desc": null,
        "sub_jobs": [],
        "children": [
            {
                "id": 2,
                "parent_id": 1,
                "department_name": "销售部",
                "position_title": "总监",
                "ai_empowerment_level": 1,
                "efficiency_improvement_percent": 50,
                "job_desc": null,
                "sub_jobs": [],
                "children": []
            },
            {
                "id": 3,
                "parent_id": 1,
                "department_name": "运营部mod",
                "position_title": "总监mod",
                "ai_empowerment_level": 2,
                "efficiency_improvement_percent": 88,
                "job_desc": null,
                "sub_jobs": [],
                "children": [
                    {
                        "id": 4,
                        "parent_id": 3,
                        "department_name": "北京运营中心",
                        "position_title": "总监",
                        "ai_empowerment_level": 2,
                        "efficiency_improvement_percent": 90,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    }
                ]
            },
            {
                "id": 5,
                "parent_id": 1,
                "department_name": "技术部",
                "position_title": "技术总监",
                "ai_empowerment_level": 2,
                "efficiency_improvement_percent": 90,
                "job_desc": null,
                "sub_jobs": [],
                "children": [
                    {
                        "id": 6,
                        "parent_id": 5,
                        "department_name": "AIWork-OS开发部",
                        "position_title": "技术负责人",
                        "ai_empowerment_level": 2,
                        "efficiency_improvement_percent": 90,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 7,
                        "parent_id": 5,
                        "department_name": "测试删除",
                        "position_title": "总监",
                        "ai_empowerment_level": 1,
                        "efficiency_improvement_percent": 50,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 8,
                        "parent_id": 5,
                        "department_name": "测试删除1",
                        "position_title": "总监",
                        "ai_empowerment_level": 1,
                        "efficiency_improvement_percent": 50,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 9,
                        "parent_id": 5,
                        "department_name": "测试删除1",
                        "position_title": "总监",
                        "ai_empowerment_level": 1,
                        "efficiency_improvement_percent": 50,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 10,
                        "parent_id": 5,
                        "department_name": "测试删除1",
                        "position_title": "总监",
                        "ai_empowerment_level": 1,
                        "efficiency_improvement_percent": 50,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 11,
                        "parent_id": 5,
                        "department_name": "测试删除1",
                        "position_title": "总监",
                        "ai_empowerment_level": 1,
                        "efficiency_improvement_percent": 50,
                        "job_desc": null,
                        "sub_jobs": [],
                        "children": []
                    },
                    {
                        "id": 16,
                        "parent_id": 5,
                        "department_name": "AIWork-OS开发部2",
                        "position_title": "技术负责人2",
                        "ai_empowerment_level": 2,
                        "efficiency_improvement_percent": 90,
                        "job_desc": "AIWork-OS开发和推广",
                        "sub_jobs": [
                            {
                                "id": 8,
                                "department_id": 16,
                                "job_title": "需求分析",
                                "job_desc": "明确任务开发需求",
                                "agent_id": "BXECF",
                                "manual_task": "制定需求",
                                "agent_task": "需求拆解，制定落地方案"
                            },
                            {
                                "id": 9,
                                "department_id": 16,
                                "job_title": "任务指派",
                                "job_desc": "任务下发到个人",
                                "agent_id": "CCCC",
                                "manual_task": "任务下发",
                                "agent_task": "无"
                            },
                            {
                                "id": 10,
                                "department_id": 16,
                                "job_title": "任务验收",
                                "job_desc": "验收开发成果",
                                "agent_id": "SSSSS",
                                "manual_task": "按需求文档和任务进度要求验收",
                                "agent_task": "code review"
                            }
                        ],
                        "children": []
                    }
                ]
            }
        ]
    }
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## POST 添加用户[添加用户所属部门]

POST /api/auth/jwt/users/create

> Body 请求参数

```json
{
  "username": "user0002",
  "password": "111111",
  "role_names": [
    "user"
  ],
  "department_id": 2
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|
|body|body|object| 是 |none|

> 返回示例

> 200 Response

```json
{"id":113,"username":"user0002","is_active":true,"roles":["user"],"department_name":"销售部"}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## PUT 修改用户角色和部门

PUT /api/auth/jwt/users/113

> Body 请求参数

```json
{
  "department_id": 5,
  "role_ids": [
    2
  ]
}
```

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Authorization|header|string| 否 |none|
|body|body|object| 是 |none|

> 返回示例

> 200 Response

```json
{"id":113,"username":"user0002","is_active":true,"roles":["user"],"department_name":null}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

# 数据模型

