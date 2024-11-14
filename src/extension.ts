import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('ne-gen-dartmodel.generateDartModel', async () => {
    try {
      // Prompt for model class name
      const modelName = await vscode.window.showInputBox({
        placeHolder: "Enter the model class name (e.g., UserModel)"
      });
      if (!modelName) {
        vscode.window.showErrorMessage("Model class name is required.");
        return;
      }

      // Prompt for base class name
      const baseClassName = await vscode.window.showInputBox({
        placeHolder: "Enter the base class name to extend (e.g., UserEntity)"
      });
      if (!baseClassName) {
        vscode.window.showErrorMessage("Base class name is required.");
        return;
      }

      // Search for the base class file
      const baseClassPath = await findBaseClassFile(baseClassName);
      if (!baseClassPath) {
        vscode.window.showErrorMessage(`Base class "${baseClassName}" not found.`);
        return;
      }

      // Extract fields from the base class
      const baseClassFields = await extractFieldsFromBaseClass(baseClassPath, baseClassName);
      if (baseClassFields.length === 0) {
        vscode.window.showErrorMessage(`No fields found in base class "${baseClassName}".`);
        return;
      }

      // Prompt for location to save the generated file
      const targetUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        openLabel: "Select folder to save the generated model file"
      });
      if (!targetUri || targetUri.length === 0) {
        vscode.window.showErrorMessage("No target directory selected.");
        return;
      }

      const targetDir = targetUri[0].fsPath;
      const fileName = `${modelName.toLowerCase().replace(/model$/, "_model")}.dart`;
      const filePath = path.join(targetDir, fileName);

      // Generate the Dart model file content
      const dartModel = generateDartModelWithJsonSerializable(modelName, baseClassName, baseClassFields, baseClassPath, targetDir);

      // Write the generated Dart model file
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, dartModel, 'utf-8');

      // Open the generated file in VS Code
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      // Run the build_runner command to generate the .g.dart file
      vscode.window.showInformationMessage("Running build_runner to generate .g.dart file...");
      exec('dart run build_runner build', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath }, (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(`Error running build_runner: ${stderr}`);
          return;
        }
        vscode.window.showInformationMessage("Successfully generated .g.dart file.");
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate Dart model: ${error}`);
    }
  });

  context.subscriptions.push(disposable);
}

// Function to find the base class file in the workspace
async function findBaseClassFile(baseClassName: string): Promise<string | null> {
  const files = await vscode.workspace.findFiles('**/*.dart');
  for (const file of files) {
    const content = await vscode.workspace.fs.readFile(file);
    if (content.toString().includes(`class ${baseClassName}`)) {
      return file.fsPath;
    }
  }
  return null;
}

// Improved function to extract fields from the base class file
// Improved function to extract fields from the base class file
async function extractFieldsFromBaseClass(filePath: string, baseClassName: string): Promise<string[]> {
  const content = await fs.promises.readFile(filePath, 'utf-8');

  // Updated regular expression to match fields with complex generic types like Map<String, dynamic>
  const fieldRegex = /final\s+([\w<>,\s|]+)\s+(\w+);/g;

  const fields: string[] = [];
  let match;
    const filter =  content.replace(/<\s*([\w<, >]+)\s*>/g, genericPart => {
      return `<${genericPart.replace(/\s*,\s*/g, ',')}>`;
    });
  while ((match = fieldRegex.exec(filter)) !== null) {
    let fieldType = match[1].trim(); // Captures full type (e.g., "Map<String, dynamic>")
    const fieldName = match[2].trim(); // Captures field name (e.g., "tokens")

    // Remove unnecessary spaces around commas within generic type declarations
  

    fields.push(`final ${fieldType} ${fieldName};`);
    console.log(`Extracted field: ${fieldType} ${fieldName}`);
  }

  if (fields.length === 0) {
    console.log(`No fields found in base class "${baseClassName}".`);
  }

  return fields;
}




// Function to generate Dart model code with JsonSerializable annotation
function generateDartModelWithJsonSerializable(
  modelName: string,
  baseClassName: string,
  baseClassFields: string[],
  baseClassPath: string,
  targetDir: string
): string {
  const constructorArgs = baseClassFields
    .map(field => {
      const fieldName = field.split(' ')[2].replace(';', '');
      return `required super.${fieldName},`;
    })
    .join('\n    ');

  // Calculate the correct relative import path based on the target directory
  const relativeBaseClassImport = path.relative(targetDir, baseClassPath).replace(/\\/g, '/');

  return `
import 'package:json_annotation/json_annotation.dart';
import '${relativeBaseClassImport}';

part '${modelName.toLowerCase().replace(/model$/, "_model")}.g.dart';

@JsonSerializable()
class ${modelName} extends ${baseClassName} {
  ${modelName}({
    ${constructorArgs}
  });

  factory ${modelName}.fromMap(Map<String, dynamic> json) =>
      _$${modelName}FromJson(json);

  Map<String, dynamic> toMap() => _$${modelName}ToJson(this);
}
`;
}

export function deactivate() {}
