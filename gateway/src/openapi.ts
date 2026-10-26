export const openApiSpec = {
	openapi: "3.0.3",
	info: {
		title: "Adversarial Contract Tester Gateway",
		version: "0.1.0",
	},
	paths: {
		"/health": {
			get: {
				summary: "Gateway health (DuckDB essential, fuzzer enhancement)",
				responses: {
					"200": {
						description:
							"healthy or degraded",
					},
					"503": { description: "unhealthy" },
				},
			},
		},
		"/v1/telemetry": {
			get: {
				summary: 'WebSocket telemetry stream. Send {type:"START_TEST_RUN",fuzzerMode,edgeId?}; receive RUN_STARTED, TRACE_EMITTED, RUN_COMPLETED, ERROR frames.',
				responses: {
					"101": {
						description:
							"Switching Protocols",
					},
				},
			},
		},
		"/v1/traces": {
			post: {
				summary: "Ingest and validate an inter-agent trace against its Zod contract",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: [
									"runId",
									"edgeId",
									"payload",
								],
								properties: {
									runId: {
										type: "string",
									},
									edgeId: {
										type: "string",
									},
									payload: {},
									mutation: {
										type: "object",
										properties: {
											mutationType:
												{
													type: "string",
												},
											originalPayload:
												{},
											strategy: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				responses: {
					"201": { description: "Trace stored" },
					"422": {
						description:
							"Invalid request or unknown edge",
					},
				},
			},
			get: {
				summary: "List persisted traces",
				parameters: [
					{
						name: "runId",
						in: "query",
						schema: { type: "string" },
					},
					{
						name: "edgeId",
						in: "query",
						schema: { type: "string" },
					},
					{
						name: "limit",
						in: "query",
						schema: {
							type: "integer",
							minimum: 1,
							maximum: 1000,
						},
					},
				],
				responses: { "200": { description: "Traces" } },
			},
		},
		"/v1/runs": {
			get: {
				summary: "List runs with edge health summaries",
				responses: { "200": { description: "Runs" } },
			},
		},
	},
} as const;
