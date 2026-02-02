// argNodeInfoSchema.ts
import { z } from 'zod';


// 定义单个 ArgNodeInfo 的 schema
export const ArgNodeInfoSchema = z.object({
    node_name: z.string().min(1, "Node name is required"),
    node_id: z.string().min(1, "Node ID is required"),
    node_domain_or_ip: z.string().min(1, "Domain or IP is required"),
    p2p_port: z.number().int().gte(1).lte(65535),
    rpc_port: z.number().int().gte(1).lte(65535),
    abci_port: z.number().int().gte(1).lte(65535),
    webservice_port: z.number().int().gte(1).lte(65535),
    is_validator: z.boolean(),
});

// 自动推导 TypeScript 类型（与 Go struct 对齐）
export type ArgNodeInfo = z.infer<typeof ArgNodeInfoSchema>;

// 支持单个对象或数组的联合 schema
export const ArgNodeInfoOrArraySchema = z.union([
    ArgNodeInfoSchema,           // 单个对象
    z.array(ArgNodeInfoSchema),  // 对象数组
]);

// 如果你希望总是得到数组（便于后续处理），可以封装一个 normalize 函数
export function normalizeToNodeArray(input: unknown): ArgNodeInfo[] {
    const result = ArgNodeInfoOrArraySchema.safeParse(input);
    if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`);
    }

    const data = result.data;
    return Array.isArray(data) ? data : [data];
}