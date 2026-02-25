/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as http from 'node:http';
import * as https from 'node:https';
import { Inject, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { envOption } from '@/env.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import type { DeleteObjectCommandInput, PutObjectCommandInput } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
	constructor(
		private httpRequestService: HttpRequestService,
		@Inject(DI.config) private config: Config,
	) {
	}

	@bindThis
	public getS3Client(meta: MiMeta): S3Client {
		const isManaged = envOption.managed && this.config.objectStorage?.useObjectStorage;
		const storage = isManaged ? this.config.objectStorage! : meta;
		const u = storage.objectStorageEndpoint
			? `${storage.objectStorageUseSSL ? 'https' : 'http'}://${storage.objectStorageEndpoint}`
			: `${storage.objectStorageUseSSL ? 'https' : 'http'}://example.net`; // dummy url to select http(s) agent

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !storage.objectStorageUseProxy, true);
		const handlerOption: NodeHttpHandlerOptions = {};
		if (storage.objectStorageUseSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: storage.objectStorageEndpoint ? u : undefined,
			credentials: (storage.objectStorageAccessKey !== null && storage.objectStorageSecretKey !== null) ? {
				accessKeyId: storage.objectStorageAccessKey,
				secretAccessKey: storage.objectStorageSecretKey,
			} : undefined,
			region: storage.objectStorageRegion ? storage.objectStorageRegion : undefined, // 空文字列もundefinedにするため ?? は使わない
			tls: storage.objectStorageUseSSL,
			forcePathStyle: storage.objectStorageEndpoint ? storage.objectStorageS3ForcePathStyle : false, // AWS with endPoint omitted
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async upload(meta: MiMeta, input: PutObjectCommandInput) {
		const client = this.getS3Client(meta);
		return new Upload({
			client,
			params: input,
			partSize: (client.config.endpoint && (await client.config.endpoint()).hostname === 'storage.googleapis.com')
				? 500 * 1024 * 1024
				: 8 * 1024 * 1024,
		}).done();
	}

	@bindThis
	public delete(meta: MiMeta, input: DeleteObjectCommandInput) {
		const client = this.getS3Client(meta);
		return client.send(new DeleteObjectCommand(input));
	}
}
