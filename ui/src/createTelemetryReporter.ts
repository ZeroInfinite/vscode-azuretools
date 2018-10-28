/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as console from 'console';
import * as process from 'process';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ITelemetryReporter } from '../index';
import { ext, extInitialized } from './extensionVariables';

// tslint:disable-next-line:strict-boolean-expressions
const debugTelemetryEnabled: boolean = !/^(false|0)?$/i.test(process.env.DEBUGTELEMETRY || '');

class DebugReporter implements ITelemetryReporter {
    constructor(private _extensionName: string, private _extensionVersion: string) {
    }

    public sendTelemetryEvent(eventName: string, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }): void {
        try {
            // tslint:disable-next-line:strict-boolean-expressions
            const propertiesString: string = JSON.stringify(properties || {});
            // tslint:disable-next-line:strict-boolean-expressions
            const measuresString: string = JSON.stringify(measures || {});
            // tslint:disable-next-line:no-console
            console.log(`** TELEMETRY("${this._extensionName}/${eventName}", ${this._extensionVersion}) properties=${propertiesString}, measures=${measuresString}`);
        } catch (error) {
            console.error(error);
        }
    }
}
export function createTelemetryReporter(ctx: vscode.ExtensionContext): ITelemetryReporter {
    assert(extInitialized, 'registerUIExtensionVariables must be called first'); // asdf why this?

    const { name: extensionName, version: extensionVersion, aiKey } = ext.packageInfo;

    if (debugTelemetryEnabled || !aiKey) {
        console.warn(aiKey ? `${extensionName}: DEBUGTELEMETRY mode enabled - not sending telemetry` : 'Unable to obtain package info, cannot send telemetry');
        return new DebugReporter(extensionName, extensionVersion);
    } else {
        const reporter: TelemetryReporter = new TelemetryReporter(extensionName, extensionVersion, aiKey);
        ctx.subscriptions.push(reporter);
        return reporter;
    }
}
