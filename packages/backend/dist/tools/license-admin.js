"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../db/client");
const licensing_service_1 = require("../modules/licensing/licensing.service");
function readArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return undefined;
    return process.argv[index + 1];
}
function readIntArg(flag) {
    const value = readArg(flag);
    return value ? parseInt(value, 10) : undefined;
}
function printUsage() {
    console.log(`
Uso:
  npm run license:list -- --org 1
  npm run license:generate -- --org 1 --label "Mensual junio" --days 30 --grace 7
  npm run license:renew -- --id 3 --days 30
  npm run license:suspend -- --id 3
  npm run license:cancel -- --id 3
  npm run license:activate -- --code TAV-XXXX --org 1
`);
}
async function listLicenses() {
    const organisationId = readIntArg('--org');
    const licenses = await client_1.prisma.license.findMany({
        where: organisationId ? { organisationId } : undefined,
        include: {
            organisation: {
                select: { id: true, name: true, nif: true },
            },
        },
        orderBy: [{ createdAt: 'desc' }],
    });
    if (licenses.length === 0) {
        console.log('No hay licencias.');
        return;
    }
    for (const license of licenses) {
        console.log([
            `#${license.id}`,
            license.code,
            license.status,
            license.organisation?.name ?? 'Sin asignar',
            `válida hasta ${license.validUntil.toISOString()}`,
            `gracia hasta ${license.graceUntil.toISOString()}`,
        ].join(' | '));
    }
}
async function generateNewLicense() {
    const organisationId = readIntArg('--org');
    if (!organisationId) {
        throw new Error('Debes indicar --org <organisationId>');
    }
    const label = readArg('--label');
    const validityDays = readIntArg('--days');
    const graceDays = readIntArg('--grace');
    const notes = readArg('--notes');
    const license = await (0, licensing_service_1.generateLicense)({
        organisationId,
        label,
        validityDays,
        graceDays,
        notes,
    });
    console.log(`Licencia generada: ${license.code}`);
    console.log(`ID: ${license.id}`);
    console.log(`Válida hasta: ${license.validUntil.toISOString()}`);
    console.log(`Gracia hasta: ${license.graceUntil.toISOString()}`);
}
async function renewExistingLicense() {
    const id = readIntArg('--id');
    if (!id) {
        throw new Error('Debes indicar --id <licenseId>');
    }
    const validityDays = readIntArg('--days');
    const license = await (0, licensing_service_1.refreshLicense)(id, validityDays);
    console.log(`Licencia renovada: ${license.code}`);
    console.log(`Nueva validez: ${license.validUntil.toISOString()}`);
}
async function changeStatus(status) {
    const id = readIntArg('--id');
    if (!id) {
        throw new Error('Debes indicar --id <licenseId>');
    }
    const license = await (0, licensing_service_1.updateLicenseStatus)(id, status);
    console.log(`Licencia ${license.code} actualizada a ${license.status}`);
}
async function activateByCode() {
    const organisationId = readIntArg('--org');
    const code = readArg('--code');
    if (!organisationId || !code) {
        throw new Error('Debes indicar --org <organisationId> y --code <codigo>');
    }
    const license = await client_1.prisma.license.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!license) {
        throw new Error('Código de licencia no encontrado');
    }
    await client_1.prisma.license.updateMany({
        where: { organisationId },
        data: { organisationId: null },
    });
    const updated = await client_1.prisma.license.update({
        where: { id: license.id },
        data: {
            organisationId,
            activatedAt: new Date(),
            lastValidatedAt: new Date(),
            lastSeenAt: new Date(),
            status: 'ACTIVE',
        },
    });
    console.log(`Licencia ${updated.code} asignada a la organización ${organisationId}`);
}
async function main() {
    const command = process.argv[2];
    if (!command) {
        printUsage();
        return;
    }
    switch (command) {
        case 'list':
            await listLicenses();
            break;
        case 'generate':
            await generateNewLicense();
            break;
        case 'renew':
            await renewExistingLicense();
            break;
        case 'suspend':
            await changeStatus('SUSPENDED');
            break;
        case 'cancel':
            await changeStatus('CANCELLED');
            break;
        case 'activate':
            await activateByCode();
            break;
        default:
            printUsage();
    }
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.prisma.$disconnect();
});
//# sourceMappingURL=license-admin.js.map