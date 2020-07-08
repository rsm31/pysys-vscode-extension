import * as vscode from "vscode";
import { config } from "process";
import { PysysDirectory, PysysProject } from "../pysys/pysys";

export interface PysysTaskDefinition extends vscode.TaskDefinition {
    type: string;
    task: string;
    cwd: string;
    project: string;
    extraargs: string[];
    problemMatcher: string[];
    label: string
}

export class PysysTaskProvider implements vscode.TaskProvider {

    private config: vscode.WorkspaceConfiguration;
    private interpreter: string | undefined;

    constructor(private workspace: vscode.WorkspaceFolder) { 
        this.config = vscode.workspace.getConfiguration("pysys"); 
        this.interpreter = this.config.get("defaultInterpreterPath");
    }

    provideTasks(): vscode.ProviderResult<vscode.Task[]> {
        return [this.runTest()];
    }

    resolveTask(_task: vscode.Task): vscode.Task | undefined {
        const task: vscode.Task = _task.definition.task;
        if(task) {
            const definition: PysysTaskDefinition = <any>_task.definition;
            return new vscode.Task(
                definition,
                definition.task,
                "pysys",
                new vscode.ShellExecution(`${this.interpreter} ${definition.task} ${definition.extraargs.join(' ')}`, {
                    cwd: definition.cwd
                })
            );
        }
        return undefined
    }

    private runTest() {
        const task = new vscode.Task(
            {"type": "pysys",
            "task": "run",
            "cwd": `${this.workspace.uri.fsPath}/{PYSYS_PROJECT}`,
            "project": "{PYSYS_PROJECT}",
            "extraargs": []},
            "run",
            "pysys",
            new vscode.ShellExecution(`${this.interpreter} run --help`),
            []
          );
          task.group = 'pysys';
          return task;
    }

    public async writeTaskConfig(definition: PysysTaskDefinition) {
        const setting: vscode.Uri = vscode.Uri.parse(`${this.workspace.uri.fsPath}/.vscode/tasks.json`)
        const config = await vscode.workspace.openTextDocument(setting)
            .then(doc => {
                const config = JSON.parse(doc.getText());
                for(let task of config.tasks) {
                    if(task.label === definition.label) {
                        return
                    }
                }
                config.tasks.push(definition);
                return config
            });

        if (config) {
            vscode.workspace.fs.writeFile(setting, Buffer.from(JSON.stringify(config, null, 4), 'utf8'));
            vscode.window.showTextDocument(setting);
        }
    }

    public async runPysysTest(cwd: string, workspace?: vscode.WorkspaceFolder, extraargs?:string[]): Promise<vscode.Task | undefined> {
		// let localargs : string[] = this.config.args.concat(['-p',this.config.port.toString()]);
        // console.log(extraargs);
        let localargs: string[] = [];
		if( extraargs ) {
		    localargs = extraargs;
        }

        let folder: vscode.WorkspaceFolder | undefined;
        if(workspace) {
            folder = workspace;
        } else {
            if( vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
                folder = vscode.workspace.workspaceFolders[0];
            } else {
                folder = await vscode.window.showWorkspaceFolderPick();
            }
        }
        if(folder) {
            let task : vscode.Task = new vscode.Task(
                {type: "pysys", task: "run"},
                folder,
                "pysys run",
                "pysys",
                new vscode.ShellExecution(`${this.interpreter} run ${localargs.join(" ")}`, [], {
                    cwd
                }),
                ["pysys"]
            );
            task.group = "test";
            return task;
        }
		return undefined;
    }
    
    public async runCustom(element: PysysDirectory | PysysProject) {
        const tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
        let args: string[] | undefined;
        const projectDefinition: string = 
            element instanceof PysysDirectory ? 
            `${element.parent}/${element.label}` : 
            element.label

        for(let task of tasks) {
            if (task.definition.project === projectDefinition) {
                args = task.definition.extraargs
            }
        }

        const cwd: string = `${element.ws.uri.fsPath}/${projectDefinition}`
        if(args) {
            const task : vscode.Task | undefined =
                await this.runPysysTest(cwd, element.ws, args);
            if(task) {
                await vscode.tasks.executeTask(task);
            }
        } else {
            const definition: PysysTaskDefinition = {
                type: "pysys",
                task: "run",
                cwd: cwd,
                project: `${projectDefinition}`,
                extraargs: [],
                problemMatcher: ["$pysys"],
                label: `pysys: run /${projectDefinition}` 
            }

            const out = await this.writeTaskConfig(definition);
        }
    }
}
