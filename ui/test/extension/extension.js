const vscode = require('vscode');
const ui_1 = require('../../out/src/index');

function activate(context) {
    const extVars = {
        context,
        outputChannel: vscode.window.createOutputChannel('testUIExtension'),
        ui: new ui_1.AzureUserInput()
    };
    ui_1.registerUIExtensionVariables(extVars)
    extVars.reporter = ui_1.createTelemetryReporter(context);

    context.subscriptions.push(vscode.commands.registerCommand('testUIExtension.sayHello', () => { }));
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;
