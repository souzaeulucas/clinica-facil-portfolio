import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SessionControlData {
    patientName: string;
    patientCpf?: string;
    specialty: string;
    doctorName: string;
    month: Date;
    scheduleDays: string[];
}

export const generateSessionControlPDF = (data: SessionControlData) => {
    const doc = new jsPDF() as any;
    const { patientName, specialty, doctorName, month, scheduleDays } = data;

    const dayNamesMap: { [key: string]: number } = {
        'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3,
        'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6
    };

    // Unified Header: Logo (Left) + Title (Right, Green)
    const logoUrl = '/logo_uam.png';
    const pageWidth = doc.internal.pageSize.width || 210;
    const logoWidth = 50;
    const logoHeight = 16;
    doc.addImage(logoUrl, 'PNG', 14, 10, logoWidth, logoHeight);

    doc.setFontSize(16);
    doc.setTextColor(15, 118, 110); // Emerald-700 (Clinic Green)
    doc.setFont('helvetica', 'bold');
    doc.text('FOLHA DE CONTROLE DE SESSÕES', pageWidth - 14, 21, { align: 'right' });

    // Sophisticated Info Box - Centered and Moved Up
    const boxWidth = 182;
    const boxX = (pageWidth - boxWidth) / 2;
    const boxY = 32;
    const boxHeight = 24;

    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.setFont('helvetica', 'normal');

    // Row 1
    doc.text('PACIENTE', boxX + 12, boxY + 5.5);
    doc.text('CPF', boxX + 105, boxY + 5.5);

    // Row 2
    doc.text('ESPECIALIDADE', boxX + 12, boxY + 14.5);
    doc.text('REFERÊNCIA', boxX + 105, boxY + 14.5);

    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // Slate 800
    doc.setFont('helvetica', 'bold');

    // Values Row 1
    doc.text(patientName.toUpperCase(), boxX + 12, boxY + 9.5);
    doc.text(data.patientCpf || '---.---.---.--', boxX + 105, boxY + 9.5);

    // Values Row 2
    doc.text(specialty.toUpperCase(), boxX + 12, boxY + 18.5);
    doc.text(format(month, 'MMMM / yyyy', { locale: ptBR }).toUpperCase(), boxX + 105, boxY + 18.5);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.text(`PROFISSIONAL RESPONSÁVEL: ${doctorName.toUpperCase()}`, pageWidth / 2, boxY + 31, { align: 'center' });

    let currentY = boxY + 34;

    // Filter relevant days for the month
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const relevantDays = allDays.filter(day => {
        const dayOfWeek = getDay(day);
        return scheduleDays.some(d => dayNamesMap[d] === dayOfWeek);
    });

    // Table
    const tableData = relevantDays.map((day, index) => [
        index + 1,
        format(day, "dd/MM/yyyy (EEEE)", { locale: ptBR }),
        '[  ]', // Payment checkbox placeholder
        '[  ]', // Presence checkbox placeholder
        '_______________________' // Signature placeholder
    ]);

    const tableWidth = 185;
    autoTable(doc, {
        startY: currentY + 2,
        margin: { left: (pageWidth - tableWidth) / 2 },
        tableWidth: tableWidth,
        head: [['#', 'Data da Sessão', 'Pagamento', 'Presença', 'Assinatura do Paciente']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [15, 118, 110], fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 8, cellPadding: 5.5, valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 42, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 20, halign: 'center' },
            4: { cellWidth: 95, halign: 'center' }
        },
        willDrawCell: (data) => {
            // Ensure small table height to fit one page if possible
            if (data.row.index > 22) {
                doc.setFontSize(7);
            }
        }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text('Documento gerado pelo Sistema ClinicaFacil', pageWidth / 2, 290, { align: 'center' });

    // Open in new tab for printing instead of downloading
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};
