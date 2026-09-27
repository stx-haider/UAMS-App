import React, { useState, useRef } from 'react';
import { Search, UploadCloud, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef(null);

  // Excel File Upload & Parse Logic
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(sheet);
      
      // Map data according to our requirement (Roll No, Name)
      const formattedStudents = parsedData.map(row => ({
        rollNo: row['Roll No'] || row['Roll Number'] || row['rollno'] || 'N/A',
        name: row['Name'] || row['Student Name'] || row['name'] || 'Unknown',
        status: 'Active'
      }));
      
      setStudents(formattedStudents);
    };
    reader.readAsBinaryString(file);
    
    // Reset input so same file can be uploaded again if needed
    e.target.value = null; 
  };

  // Sample Excel Download Function
  const handleDownloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([
      { "Roll No": "BSIT-001", "Name": "Ali Raza" },
      { "Roll No": "BSIT-002", "Name": "Ahmed Khan" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Sample_Students.xlsx");
  };

  // Search Filter
  const filteredStudents = students.filter(student => 
    student.rollNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="page-top-bar">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by roll no. or name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-upload" 
            style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e5e7eb' }}
            onClick={handleDownloadSample}
          >
            <Download size={18} /> Sample Excel
          </button>
          
          <button className="btn-upload" onClick={() => fileInputRef.current.click()}>
            <UploadCloud size={18} /> Upload Excel
          </button>
          {/* Hidden File Input */}
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileUpload} 
          />
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student, index) => (
                <tr key={index}>
                  <td style={{ fontWeight: '500' }}>{student.rollNo}</td>
                  <td>{student.name}</td>
                  <td><span className="status-active">{student.status}</span></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  No students added yet. Upload an Excel file to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {students.length > 0 && (
        <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
          Showing {filteredStudents.length} students
        </div>
      )}
    </div>
  );
}