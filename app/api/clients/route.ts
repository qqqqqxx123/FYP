import { NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID;
const CLIENTS_TABLE_ID = process.env.NOCODB_CLIENTS_TABLE_ID ?? "Clients";

export async function GET() {
  try {
    if (!NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
      return NextResponse.json(
        { error: "NocoDB configuration missing" },
        { status: 500 }
      );
    }

    const headers = {
      "xc-token": NOCODB_API_TOKEN,
      "Content-Type": "application/json",
    };
    const fetchOpts = { headers, cache: "no-store" as RequestCache };

    let res = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${CLIENTS_TABLE_ID}/records?limit=500&pageSize=100`,
      fetchOpts
    );

    if (!res.ok && NOCODB_BASE_ID) {
      res = await fetch(
        `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${CLIENTS_TABLE_ID}?limit=500`,
        fetchOpts
      );
    }

    if (!res.ok) {
      throw new Error("Failed to fetch clients");
    }

    const data = (await res.json()) as {
      list?: Array<Record<string, unknown>>;
      data?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
      pageInfo?: { totalRows?: number; pageSize?: number };
    };

    let list = data?.list ?? data?.data ?? data?.records ?? [];
    const pageInfo = data?.pageInfo;
    if (pageInfo?.totalRows != null && pageInfo?.pageSize != null && list.length < pageInfo.totalRows) {
      const pageSize = pageInfo.pageSize;
      for (let offset = pageSize; offset < pageInfo.totalRows; offset += pageSize) {
        const nextRes = await fetch(
          `${NOCODB_BASE_URL}/api/v2/tables/${CLIENTS_TABLE_ID}/records?limit=${pageSize}&offset=${offset}`,
          fetchOpts
        );
        if (!nextRes.ok) break;
        const nextData = (await nextRes.json()) as { list?: Array<Record<string, unknown>> };
        const nextList = nextData?.list ?? [];
        if (nextList.length === 0) break;
        list = [...list, ...nextList];
      }
    }

    return NextResponse.json({ clients: list });
  } catch (error) {
    console.error("Clients list error:", error);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 }
    );
  }
}
