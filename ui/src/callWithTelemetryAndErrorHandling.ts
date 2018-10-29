/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MessageItem, window } from 'vscode';
import { IActionContext } from '../index';
import { IParsedError } from '../index';
import { DialogResponses } from './DialogResponses';
import { ext, extInitialized } from './extensionVariables';
import { localize } from './localize';
import { parseError } from './parseError';
import { reportAnIssue } from './reportAnIssue';

function initContext(): [IActionContext, number] {
    assert(extInitialized, 'registerUIExtensionVariables must be called first');

    return [{
        properties: {
            isActivationEvent: 'false',
            cancelStep: '',
            result: 'Succeeded',
            error: '',
            errorMessage: ''
        },
        measurements: {
            duration: 0
        },
        suppressTelemetry: false,
        suppressErrorDisplay: false,
        rethrowError: false
    }, Date.now()];
}

export function callWithTelemetryAndErrorHandlingSync<T>(callbackId: string, callback: (this: IActionContext) => T): T | undefined {
    const [context, start] = initContext();

    try {
        return <T>callback.call(context);
    } catch (error) {
        return handleError(context, callbackId, error);
    } finally {
        handleFinally(context, callbackId, start);
    }
}

export async function callWithTelemetryAndErrorHandling<T>(callbackId: string, callback: (this: IActionContext) => T | PromiseLike<T>): Promise<T | undefined> {
    const [context, start] = initContext();

    try {
        return await <Promise<T>>Promise.resolve(callback.call(context));
    } catch (error) {
        return handleError(context, callbackId, error);
    } finally {
        handleFinally(context, callbackId, start);
    }
}

// tslint:disable-next-line:no-any
function handleError(context: IActionContext, callbackId: string, error: any): undefined {
    const errorData: IParsedError = parseError(error);
    if (errorData.isUserCancelledError) {
        context.properties.result = 'Canceled';
        context.suppressErrorDisplay = true;
        context.rethrowError = false;
    } else {
        context.properties.result = 'Failed';
        context.properties.error = errorData.errorType;
        context.properties.errorMessage = errorData.message;
    }

    if (!context.suppressErrorDisplay) {
        // Always append the error to the output channel, but only 'show' the output channel for multiline errors
        ext.outputChannel.appendLine(localize('outputError', 'Error: {0}', errorData.message));

        let message: string;
        if (errorData.message.includes('\n')) {
            ext.outputChannel.show();
            message = localize('multilineError', 'An error has occured. Check output window for more details.');
        } else {
            message = errorData.message;
        }

        // don't wait
        window.showErrorMessage(message, DialogResponses.reportAnIssue).then((result: MessageItem | undefined) => {
            if (result === DialogResponses.reportAnIssue) {
                reportAnIssue(callbackId, errorData);
            }
        });
    }

    if (context.rethrowError) {
        throw error;
    } else {
        return undefined;
    }
}

function handleFinally(context: IActionContext, callbackId: string, start: number): void {
    if (ext.reporter) {
        // For suppressTelemetry=true, ignore successful results
        if (!(context.suppressTelemetry && context.properties.result === 'Succeeded')) {
            const end: number = Date.now();
            context.measurements.duration = (end - start) / 1000;

            // Note: The id of the extension is automatically prepended to the given callbackId (e.g. "vscode-cosmosdb/")
            ext.reporter.sendTelemetryEvent(callbackId, context.properties, context.measurements);
        }
    }
}
