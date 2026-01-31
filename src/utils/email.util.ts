import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'noreplycampusschield@gmail.com',
    pass: process.env.EMAIL_PASS || 'acix rfbi kujh xwtj'
  }
});

const emailTemplate = (title: string, content: string) => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 4px; background-color: #ffffff;">
    <div style="background-color: #003366; padding: 25px; border-radius: 4px 4px 0 0; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px;">UniZ Examination Cell</h1>
    </div>
    <div style="padding: 40px 30px; color: #333333; line-height: 1.6;">
      <h2 style="color: #003366; margin-top: 0; font-size: 18px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px;">${title}</h2>
      ${content}
      <div style="margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 20px; font-size: 12px; color: #666666; text-align: center;">
        <p style="margin: 0 0 5px;">This is an automated notification from the UniZ Academic System.</p>
        <p style="margin: 0;">Rajiv Gandhi University of Knowledge Technologies</p>
      </div>
    </div>
  </div>
`;

export const sendResultEmail = async (email: string, username: string, semesterId: string, grades: any[]): Promise<boolean> => {
  try {
    const gradeRows = grades.map(g => `
        <tr style="border-bottom: 1px solid #eeeeee;">
            <td style="padding: 12px; font-size: 14px;">${g.subject.code}</td>
            <td style="padding: 12px; font-size: 14px;">${g.subject.name}</td>
            <td style="padding: 12px; font-weight: 600; color: #003366; text-align: center;">${g.grade}</td>
        </tr>
    `).join('');

    const content = `
      <p style="margin-bottom: 20px;">Dear Student (${username}),</p>
      <p style="margin-bottom: 20px;">The results for <strong>${semesterId}</strong> have been officially published. Please find your grade summary below:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #e0e0e0;">
        <thead style="background-color: #f8f9fa;">
            <tr>
                <th style="padding: 12px; text-align: left; font-size: 12px; color: #666666; text-transform: uppercase; font-weight: 600; border-bottom: 1px solid #e0e0e0;">Code</th>
                <th style="padding: 12px; text-align: left; font-size: 12px; color: #666666; text-transform: uppercase; font-weight: 600; border-bottom: 1px solid #e0e0e0;">Subject</th>
                <th style="padding: 12px; text-align: center; font-size: 12px; color: #666666; text-transform: uppercase; font-weight: 600; border-bottom: 1px solid #e0e0e0;">Grade</th>
            </tr>
        </thead>
        <tbody>
            ${gradeRows}
        </tbody>
      </table>

      <div style="text-align: center;">
        <a href="https://uniz.vercel.app/academics" style="background-color: #003366; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500; display: inline-block;">View Full Academic Report</a>
      </div>
    `;

    await transporter.sendMail({
      from: '"UniZ Examination Cell" <noreplycampusschield@gmail.com>',
      to: email,
      subject: `Result Declaration: ${semesterId}`,
      html: emailTemplate(`Semester Results - ${semesterId}`, content)
    });
    
    //console.log(`✅ Result email sent to ${email}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send result email to ${email}:`, error.message);
    return false;
  }
};
