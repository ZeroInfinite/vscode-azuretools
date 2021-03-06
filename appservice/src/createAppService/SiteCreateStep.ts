/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import StorageManagementClient = require('azure-arm-storage');
import { StorageAccount, StorageAccountListKeysResult } from 'azure-arm-storage/lib/models';
import { WebSiteManagementClient } from 'azure-arm-website';
import { NameValuePair, SiteConfig } from 'azure-arm-website/lib/models';
import { MessageItem, ProgressLocation, window } from 'vscode';
import { AzureWizardExecuteStep, createAzureClient } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { nonNullProp, nonNullValue, nonNullValueAndProp } from '../utils/nonNull';
import { randomUtils } from '../utils/randomUtils';
import { AppKind, getAppKindDisplayName, getSiteModelKind, WebsiteOS } from './AppKind';
import { IAppSettingsContext } from './IAppCreateOptions';
import { IAppServiceWizardContext } from './IAppServiceWizardContext';

export class SiteCreateStep extends AzureWizardExecuteStep<IAppServiceWizardContext> {
    private createFunctionAppSettings: ((context: IAppSettingsContext) => Promise<NameValuePair[]>) | undefined;

    public constructor(createFunctionAppSettings: ((context: IAppSettingsContext) => Promise<NameValuePair[]>) | undefined) {
        super();
        this.createFunctionAppSettings = createFunctionAppSettings;
    }

    public async execute(wizardContext: IAppServiceWizardContext): Promise<IAppServiceWizardContext> {
        if (!wizardContext.site) {
            const creatingNewApp: string = localize('CreatingNewApp', 'Creating {0} "{1}"...', getAppKindDisplayName(wizardContext.newSiteKind), wizardContext.newSiteName);
            await window.withProgress({ location: ProgressLocation.Notification, title: creatingNewApp }, async (): Promise<void> => {
                ext.outputChannel.appendLine(creatingNewApp);
                const client: WebSiteManagementClient = createAzureClient(wizardContext, WebSiteManagementClient);
                wizardContext.site = await client.webApps.createOrUpdate(nonNullValueAndProp(wizardContext.resourceGroup, 'name'), nonNullProp(wizardContext, 'newSiteName'), {
                    name: wizardContext.newSiteName,
                    kind: getSiteModelKind(wizardContext.newSiteKind, nonNullProp(wizardContext, 'newSiteOS')),
                    location: nonNullValueAndProp(wizardContext.location, 'name'),
                    serverFarmId: wizardContext.plan ? wizardContext.plan.id : undefined,
                    clientAffinityEnabled: wizardContext.newSiteKind === AppKind.app,
                    siteConfig: await this.getNewSiteConfig(wizardContext),
                    reserved: wizardContext.newSiteOS === WebsiteOS.linux  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
                });
                const createdNewApp: string = localize('CreatedNewApp', 'Created new {0} "{1}": {2}', getAppKindDisplayName(wizardContext.newSiteKind), wizardContext.site.name, `https://${wizardContext.site.defaultHostName}`);
                ext.outputChannel.appendLine(createdNewApp);
                ext.outputChannel.appendLine('');
                const viewOutput: MessageItem = {
                    title: localize('viewOutput', 'View Output')
                };

                // Note: intentionally not waiting for the result of this before returning
                window.showInformationMessage(createdNewApp, viewOutput).then((result: MessageItem | undefined) => {
                    if (result === viewOutput) {
                        ext.outputChannel.show();
                    }
                });
            });
        }

        return wizardContext;
    }

    private async getNewSiteConfig(wizardContext: IAppServiceWizardContext): Promise<SiteConfig> {
        const newSiteConfig: SiteConfig = {};
        if (wizardContext.newSiteKind === AppKind.app) {
            newSiteConfig.linuxFxVersion = wizardContext.newSiteRuntime;
        } else {
            const maxFileShareNameLength: number = 63;
            const storageClient: StorageManagementClient = createAzureClient(wizardContext, StorageManagementClient);

            const storageAccount: StorageAccount = nonNullProp(wizardContext, 'storageAccount');
            const [, storageResourceGroup] = nonNullValue(nonNullProp(storageAccount, 'id').match(/\/resourceGroups\/([^/]+)\//), 'Invalid storage account id');
            const keysResult: StorageAccountListKeysResult = await storageClient.storageAccounts.listKeys(storageResourceGroup, nonNullProp(storageAccount, 'name'));

            let fileShareName: string = nonNullProp(wizardContext, 'newSiteName').toLocaleLowerCase() + '-content'.slice(0, maxFileShareNameLength);
            if (!wizardContext.newStorageAccountName) {
                const randomLetters: number = 4;
                fileShareName = `${fileShareName.slice(0, maxFileShareNameLength - randomLetters - 1)}-${randomUtils.getRandomHexString(randomLetters)}`;
            }

            let storageConnectionString: string = '';
            if (keysResult.keys && keysResult.keys[0].value) {
                storageConnectionString = `DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${keysResult.keys[0].value}`;
            }

            if (this.createFunctionAppSettings) {
                newSiteConfig.appSettings = await this.createFunctionAppSettings({
                    storageConnectionString,
                    fileShareName,
                    // tslint:disable-next-line:no-non-null-assertion
                    os: wizardContext.newSiteOS!,
                    // tslint:disable-next-line:no-non-null-assertion
                    runtime: wizardContext.newSiteRuntime!
                });
            }
        }

        return newSiteConfig;
    }
}
