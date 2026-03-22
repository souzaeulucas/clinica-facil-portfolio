
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Appointment } from '../types';
import { format, parseISO, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const generateMonthlyReport = (appointments: Appointment[], currentDate: Date) => {
    // Filter appointments for the specific month
    const monthlyAppointments = appointments.filter(apt => {
        const aptDate = parseISO(apt.date);
        return isSameMonth(aptDate, currentDate);
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (monthlyAppointments.length === 0) {
        alert('Não há agendamentos para gerar o relatório neste mês.');
        return;
    }

    const doc = new jsPDF();

    // Unified Header: Logo (Left) + Title (Right, Green)
    const logoUrl = '/logo_uam.png';
    const pageWidth = doc.internal.pageSize.width || 210;
    const logoWidth = 45;
    const logoHeight = 14;
    doc.addImage(logoUrl, 'PNG', 14, 10, logoWidth, logoHeight);

    const generatedDate = `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(generatedDate, pageWidth - 14, 12, { align: 'right' });

    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110); // Emerald-700
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO MENSAL DE SESSÕES', pageWidth - 14, 20, { align: 'right' });

    const reportTitle = format(currentDate, 'MMMM yyyy', { locale: ptBR }).toUpperCase();
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(reportTitle, pageWidth - 14, 26, { align: 'right' });

    // Summary Stats
    const totalSessions = monthlyAppointments.length;
    const attended = monthlyAppointments.filter(a => a.attendance_status === 'attended').length;
    const missed = monthlyAppointments.filter(a => a.attendance_status === 'missed').length;
    const justified = monthlyAppointments.filter(a => a.attendance_status === 'justified').length;
    const pending = totalSessions - attended - missed - justified;

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Total: ${totalSessions}  |  Realizadas: ${attended}  |  Faltas: ${missed}  |  Justificadas: ${justified}  |  Pendentes: ${pending}`, 14, 34);

    // Table
    const tableColumn = ["Data", "Horário", "Paciente", "Pagamento", "Status", "Plano/Esp."];
    const tableRows: any[] = [];

    monthlyAppointments.forEach(apt => {
        const date = format(parseISO(apt.date), 'dd/MM/yyyy');
        const time = format(parseISO(apt.date), 'HH:mm');
        const patient = apt.patients?.name || 'N/A';
        const payment = apt.is_paid ? 'Sim' : 'Não';

        let status = 'Agendado';
        if (apt.attendance_status === 'attended') status = 'Realizada';
        else if (apt.attendance_status === 'missed') status = 'Falta';
        else if (apt.attendance_status === 'justified') status = 'Justificada';

        // Add type if evaluation
        if (apt.type === 'Avaliação') {
            status = `Avaliação (${status})`;
        }

        const specialty = apt.specialty?.name || '-';

        tableRows.push([date, time, patient, payment, status, specialty]);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 38,
        theme: 'grid',
        headStyles: {
            fillColor: [15, 118, 110],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        columnStyles: {
            0: { halign: 'center', cellWidth: 22 },
            1: { halign: 'center', cellWidth: 15 },
            2: { cellWidth: 55 },
            3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'center', cellWidth: 22 },
            5: { cellWidth: 50 }
        }
    });


    // Save
    // Open in new tab for printing instead of downloading
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};

export const generatePatientMonthlyReport = (patientName: string, appointments: Appointment[], currentDate: Date) => {
    const doc = new jsPDF();

    // Filter for the specific month
    const monthlyAppointments = appointments.filter(apt => {
        const aptDate = parseISO(apt.date);
        return isSameMonth(aptDate, currentDate);
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Unified Header: Logo (Left) + Title (Right, Green)
    const logoUrl = '/logo_uam.png';
    const pageWidth = doc.internal.pageSize.width || 210;
    const logoWidth = 45;
    const logoHeight = 14;
    doc.addImage(logoUrl, 'PNG', 14, 10, logoWidth, logoHeight);

    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110); // Emerald-700
    doc.setFont('helvetica', 'bold');
    doc.text('CONTROLE MENSAL DE SESSÕES', pageWidth - 14, 20, { align: 'right' });

    // Sophisticated Info Box - Centered and Moved Up
    const boxWidth = 182;
    const boxX = (pageWidth - boxWidth) / 2;
    const boxY = 28;
    const boxHeight = 20;

    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.setFont("helvetica", "normal");

    doc.text("PACIENTE", boxX + 12, boxY + 6.5);
    doc.text("CPF", boxX + 85, boxY + 6.5);
    doc.text("MÊS DE REFERÊNCIA", boxX + 125, boxY + 6.5);

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");

    const patientCpf = appointments[0]?.patients?.cpf || '---.---.---.---';
    doc.text(patientName.toUpperCase(), boxX + 12, boxY + 13.5);
    doc.text(patientCpf, boxX + 85, boxY + 13.5);
    doc.text(format(currentDate, 'MMMM yyyy', { locale: ptBR }).toUpperCase(), boxX + 125, boxY + 13.5);

    // Table
    const tableColumn = ["DATA", "HORÁRIO", "PROF./TIPO", "PAG. (X)", "PRES. (X)", "RUBRICA DO PACIENTE"];
    const tableRows = monthlyAppointments.map(apt => [
        format(parseISO(apt.date), 'dd/MM/yyyy'),
        format(parseISO(apt.date), 'HH:mm'),
        `${apt.doctors?.name || 'Geral'} (${apt.type})`,
        apt.is_paid ? ' [ X ] ' : ' [   ] ',
        apt.attendance_status === 'attended' ? ' [ X ] ' : ' [   ] ',
        '________________________'
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: boxY + boxHeight + 8,
        theme: 'grid',
        headStyles: {
            fillColor: [15, 118, 110], // Emerald-700
            textColor: [255, 255, 255],
            fontSize: 8,
            halign: 'center',
            fontStyle: 'bold'
        },
        styles: {
            fontSize: 7.5,
            cellPadding: 6,
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'center', cellWidth: 18 },
            2: { cellWidth: 55 },
            3: { halign: 'center', cellWidth: 20 }, // Payment
            4: { halign: 'center', cellWidth: 20 }, // Presence
            5: { halign: 'center' } // Signature
        },
        alternateRowStyles: { fillColor: [252, 253, 254] }
    });

    // Footer / Totals
    const finalY = (doc as any).lastAutoTable.finalY + 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("OBSERVAÇÕES:", 14, finalY);
    doc.line(14, finalY + 5, 196, finalY + 5);
    doc.line(14, finalY + 12, 196, finalY + 12);

    // Legal / Instruction
    doc.setFontSize(7);
    doc.text("* Este documento serve como comprovante de comparecimento e controle financeiro interno.", 14, finalY + 25);
    doc.text(`Gerado eletronicamente em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 196, finalY + 25, { align: 'right' });

    // Open in new tab for printing instead of downloading
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};

export const generateFinancialDetailedReport = (params: {
    patientName: string;
    patientCpf: string;
    payments: any[]; // therapy_payments with allocations and appointments
    currentDate: Date;
}) => {
    const { patientName, patientCpf, payments, currentDate } = params;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width || 210;

    // Header
    const logoUrl = '/logo_uam.png';
    doc.addImage(logoUrl, 'PNG', 14, 10, 45, 14);

    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110); // Emerald-700
    doc.setFont('helvetica', 'bold');
    doc.text('EXTRATO FINANCEIRO DETALHADO', pageWidth - 14, 20, { align: 'right' });

    // Info Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 30, pageWidth - 28, 20, 3, 3, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PACIENTE", 26, 37);
    doc.text("CPF", 100, 37);
    doc.text("DATA DE GERAÇÃO", 160, 37);

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text(patientName.toUpperCase(), 26, 44);
    doc.text(patientCpf, 100, 44);
    doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), 160, 44);

    const monthTitle = format(currentDate, 'MMMM yyyy', { locale: ptBR }).toUpperCase();
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`REFERÊNCIA: ${monthTitle}`, 14, 56);

    // Table Content
    const tableColumn = ["Data Pagamento", "Valor", "Método", "Detalhamento das Sessões Quitadas"];
    const tableRows = payments.map(pay => {
        const date = pay.payment_date ? format(parseISO(pay.payment_date), 'dd/MM/yyyy') : 'N/A';
        const amount = `R$ ${Number(pay.amount).toFixed(2)}`;
        const method = pay.payment_method === 'pix' ? 'Pix' :
            (pay.payment_method === 'card' || pay.payment_method === 'credito' || pay.payment_method === 'debito') ? 'Cartão' :
                (pay.payment_method === 'dinheiro' ? 'Dinheiro' : pay.payment_method || 'N/A');

        // Build breakdown text
        const breakdown = pay.allocations?.map((alloc: any) => {
            if (!alloc.appointment || !alloc.appointment.date) return `R$ ${Number(alloc.amount).toFixed(2)} (Sessão s/ data)`;
            try {
                const aptDate = format(parseISO(alloc.appointment.date), 'dd/MM/yyyy');
                const dayName = format(parseISO(alloc.appointment.date), 'EEEE', { locale: ptBR });
                return `R$ ${Number(alloc.amount).toFixed(2)} (${dayName}, ${aptDate})`;
            } catch (e) {
                return `R$ ${Number(alloc.amount).toFixed(2)} (Data inválida)`;
            }
        }).join('\n') || 'Pagamento avulso / Crédito';

        return [date, amount, method, breakdown];
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 60,
        theme: 'grid',
        headStyles: {
            fillColor: [15, 118, 110],
            textColor: [255, 255, 255],
            fontSize: 9,
            halign: 'center',
            fontStyle: 'bold'
        },
        styles: {
            fontSize: 8,
            cellPadding: 6,
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 30 },
            1: { halign: 'center', cellWidth: 25 },
            2: { halign: 'center', cellWidth: 25 },
            3: { cellWidth: 100 }
        }
    });

    // Save/Open
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};

